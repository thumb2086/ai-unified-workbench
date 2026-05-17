import { useMemo, useState } from 'react'
import { dump as toYaml } from 'js-yaml'
import { executeWorkflow } from '../engine/workflow-engine'
import { useWorkbench } from '../hooks/useWorkbenchState'
import {
  BlueprintNodeType,
  BlueprintStep,
  BlueprintTemplateId,
  WorkflowBlueprint,
  buildWorkflowNodesFromSteps,
  createWorkflowFromTemplate,
} from '../types/workbench'
import { toWorkflowDefinition } from '../utils/workbench'

type PreviewMode = 'json' | 'yaml'

const TEMPLATE_OPTIONS: Array<{ value: BlueprintTemplateId; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'prompt-chain', label: 'Simple Prompt Chain' },
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'relay', label: 'Relay' },
  { value: 'debate', label: 'Debate' },
  { value: 'subagent', label: 'Subagent' },
]

const STEP_TYPE_OPTIONS: BlueprintNodeType[] = ['prompt', 'agent', 'tool', 'condition', 'merge', 'output']

export function WorkflowBlueprintPage() {
  const {
    workflows,
    aiNodes,
    activeWorkflowId,
    setActiveWorkflowId,
    addWorkflow,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkbench()

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [runState, setRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [runOutput, setRunOutput] = useState('')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('json')

  const workflow = useMemo(
    () => workflows.find(item => item.id === activeWorkflowId) ?? workflows[0] ?? null,
    [workflows, activeWorkflowId],
  )

  const selectedStep = workflow?.steps.find(step => step.id === selectedStepId) ?? workflow?.steps[0] ?? null

  const updateCurrentWorkflow = (updater: (current: WorkflowBlueprint) => WorkflowBlueprint) => {
    if (!workflow) return
    updateWorkflow(workflow.id, current => normalizeWorkflow(updater(current)))
  }

  const handleCreateWorkflow = () => {
    const created = addWorkflow()
    setActiveWorkflowId(created.id)
    setSelectedStepId(created.steps[0]?.id ?? null)
  }

  const handleTemplateChange = (templateId: BlueprintTemplateId) => {
    if (!workflow) return
    if (templateId === 'custom') {
      updateCurrentWorkflow(current => ({
        ...current,
        templateId,
      }))
      return
    }

    const generated = createWorkflowFromTemplate(templateId)
    updateCurrentWorkflow(current => ({
      ...current,
      name: current.name,
      description: current.description || generated.description,
      templateId,
      editorMode: 'form',
      steps: generated.steps,
      entryPoint: generated.entryPoint,
    }))
    setSelectedStepId(generated.steps[0]?.id ?? null)
  }

  const handleStepPatch = (stepId: string, patch: Partial<BlueprintStep>) => {
    updateCurrentWorkflow(current => ({
      ...current,
      steps: current.steps.map(step => step.id === stepId ? { ...step, ...patch } : step),
    }))
  }

  const handleStepMove = (stepId: string, direction: -1 | 1) => {
    if (!workflow) return
    const index = workflow.steps.findIndex(step => step.id === stepId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= workflow.steps.length) return

    updateCurrentWorkflow(current => {
      const steps = [...current.steps]
      const [moved] = steps.splice(index, 1)
      steps.splice(nextIndex, 0, moved)
      return { ...current, steps }
    })
  }

  const handleAddStep = (type: BlueprintNodeType) => {
    if (!workflow) return
    const previousStep = workflow.steps[workflow.steps.length - 1]
    const step = createStep(type, previousStep?.id)
    updateCurrentWorkflow(current => ({
      ...current,
      templateId: 'custom',
      steps: [...current.steps, step],
    }))
    setSelectedStepId(step.id)
  }

  const handleDeleteStep = (stepId: string) => {
    updateCurrentWorkflow(current => {
      const steps = current.steps
        .filter(step => step.id !== stepId)
        .map(step => ({ ...step, dependsOn: step.dependsOn.filter(depId => depId !== stepId) }))
      return { ...current, steps }
    })
    if (selectedStepId === stepId) {
      setSelectedStepId(null)
    }
  }

  const handleRunWorkflow = async () => {
    if (!workflow) return
    setRunState('running')
    setRunOutput('')
    const result = await executeWorkflow(toWorkflowDefinition(workflow), { aiNodes })
    setRunState(result.success ? 'success' : 'error')
    setRunOutput(JSON.stringify(result, null, 2))
  }

  const previewDefinition = workflow ? toWorkflowDefinition(workflow) : null
  const previewText = previewDefinition
    ? previewMode === 'json'
      ? JSON.stringify(previewDefinition, null, 2)
      : toYaml(previewDefinition, { noRefs: true })
    : ''

  return (
    <div className="page-grid workflow-page">
      <aside className="panel sidebar-panel">
        <div className="panel-head">
          <div>
            <h2>Blueprints</h2>
            <p className="muted">Form-first workflow builder with preview and direct run support.</p>
          </div>
        </div>

        <div className="stack">
          <button className="primary" onClick={handleCreateWorkflow}>Create Blueprint</button>
          {workflow && (
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Delete "${workflow.name}"?`)) {
                  deleteWorkflow(workflow.id)
                }
              }}
            >
              Delete Blueprint
            </button>
          )}
          <button className="primary" onClick={() => void handleRunWorkflow()} disabled={!workflow}>
            {runState === 'running' ? 'Running...' : 'Run Blueprint'}
          </button>
        </div>

        <div className="workflow-list">
          {workflows.map(item => (
            <button
              key={item.id}
              className={`workflow-list-item ${item.id === workflow?.id ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkflowId(item.id)
                setSelectedStepId(item.steps[0]?.id ?? null)
              }}
            >
              <strong>{item.name}</strong>
              <span className="muted">{item.steps.length} steps</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel canvas-panel">
        {!workflow ? (
          <div className="empty-state">
            <h3>No blueprint selected</h3>
            <p>Create a blueprint to start editing.</p>
          </div>
        ) : (
          <div className="stack">
            <div className="panel-head split">
              <div>
                <h2>{workflow.name}</h2>
                <p className="muted">Author by steps, then inspect the generated workflow definition.</p>
              </div>
              <div className="row">
                <button onClick={() => setPreviewMode('json')} className={previewMode === 'json' ? 'primary' : ''}>JSON</button>
                <button onClick={() => setPreviewMode('yaml')} className={previewMode === 'yaml' ? 'primary' : ''}>YAML</button>
              </div>
            </div>

            <div className="card form-grid">
              <label>
                <span>Name</span>
                <input
                  value={workflow.name}
                  onChange={event => updateCurrentWorkflow(current => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                <span>Template</span>
                <select
                  value={workflow.templateId}
                  onChange={event => handleTemplateChange(event.target.value as BlueprintTemplateId)}
                >
                  {TEMPLATE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Description</span>
                <input
                  value={workflow.description || ''}
                  onChange={event => updateCurrentWorkflow(current => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label>
                <span>Editor Mode</span>
                <input value={workflow.editorMode} disabled />
              </label>
            </div>

            <div className="card stack">
              <div className="panel-head split">
                <strong>Blueprint Steps</strong>
                <div className="row">
                  {STEP_TYPE_OPTIONS.map(type => (
                    <button key={type} onClick={() => handleAddStep(type)}>
                      Add {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="workflow-list">
                {workflow.steps.map((step, index) => (
                  <button
                    key={step.id}
                    className={`workflow-list-item ${step.id === selectedStep?.id ? 'active' : ''}`}
                    onClick={() => setSelectedStepId(step.id)}
                  >
                    <strong>{index + 1}. {step.title}</strong>
                    <span className="muted">{step.type} {step.dependsOn.length ? `| deps: ${step.dependsOn.length}` : ''}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card stack">
              <div className="panel-head split">
                <strong>Generated Preview</strong>
                <span className="pill subtle">{previewMode.toUpperCase()}</span>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{previewText}</pre>
            </div>

            {runOutput && (
              <div className={`run-result ${runState}`}>
                <div className="panel-head">
                  <strong>Execution Result</strong>
                  <span className={`pill ${runState}`}>{runState}</span>
                </div>
                <pre>{runOutput}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="panel inspector-panel">
        {!workflow || !selectedStep ? (
          <div className="empty-state">
            <h3>No step selected</h3>
            <p>Select a step to edit its configuration.</p>
          </div>
        ) : (
          <div className="stack inspector-form">
            <div className="panel-head split">
              <div>
                <h2>Step Inspector</h2>
                <p className="muted">{selectedStep.id}</p>
              </div>
              <div className="row">
                <button onClick={() => handleStepMove(selectedStep.id, -1)}>Up</button>
                <button onClick={() => handleStepMove(selectedStep.id, 1)}>Down</button>
                <button className="danger" onClick={() => handleDeleteStep(selectedStep.id)}>Delete</button>
              </div>
            </div>

            <label>
              <span>Title</span>
              <input
                value={selectedStep.title}
                onChange={event => handleStepPatch(selectedStep.id, { title: event.target.value })}
              />
            </label>

            <label>
              <span>Type</span>
              <select
                value={selectedStep.type}
                onChange={event => handleStepPatch(selectedStep.id, resetStepType(selectedStep, event.target.value as BlueprintNodeType))}
              >
                {STEP_TYPE_OPTIONS.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Description</span>
              <textarea
                value={selectedStep.description || ''}
                onChange={event => handleStepPatch(selectedStep.id, { description: event.target.value })}
              />
            </label>

            <label>
              <span>Output Variable</span>
              <input
                value={selectedStep.outputVar || ''}
                onChange={event => handleStepPatch(selectedStep.id, { outputVar: event.target.value })}
                placeholder="final_output"
              />
            </label>

            {(selectedStep.type === 'prompt' || selectedStep.type === 'agent') && (
              <label>
                <span>Prompt</span>
                <textarea
                  value={selectedStep.prompt || ''}
                  onChange={event => handleStepPatch(selectedStep.id, { prompt: event.target.value })}
                />
              </label>
            )}

            {selectedStep.type === 'agent' && (
              <>
                <label>
                  <span>AI Node</span>
                  <select
                    value={selectedStep.aiNodeId || ''}
                    onChange={event => {
                      const node = aiNodes.find(item => item.id === event.target.value)
                      handleStepPatch(selectedStep.id, {
                        aiNodeId: event.target.value || undefined,
                        provider: node?.provider || selectedStep.provider,
                      })
                    }}
                  >
                    <option value="">-- Select --</option>
                    {aiNodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.name} ({node.kind})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Provider Override</span>
                  <input
                    value={selectedStep.provider || ''}
                    onChange={event => handleStepPatch(selectedStep.id, { provider: event.target.value })}
                    placeholder="chatgpt"
                  />
                </label>
              </>
            )}

            {selectedStep.type === 'tool' && (
              <>
                <label>
                  <span>Tool</span>
                  <select
                    value={selectedStep.tool?.name || 'fsRead'}
                    onChange={event => handleStepPatch(selectedStep.id, {
                      tool: {
                        name: event.target.value as NonNullable<BlueprintStep['tool']>['name'],
                        params: selectedStep.tool?.params || {},
                      },
                    })}
                  >
                    <option value="fsRead">fsRead</option>
                    <option value="fsWrite">fsWrite</option>
                    <option value="fsList">fsList</option>
                    <option value="shell">shell</option>
                    <option value="clipboardRead">clipboardRead</option>
                    <option value="clipboardWrite">clipboardWrite</option>
                  </select>
                </label>
                <label>
                  <span>Tool Params (JSON)</span>
                  <textarea
                    value={JSON.stringify(selectedStep.tool?.params || {}, null, 2)}
                    onChange={event => {
                      try {
                        const params = JSON.parse(event.target.value) as Record<string, unknown>
                        handleStepPatch(selectedStep.id, {
                          tool: {
                            name: selectedStep.tool?.name || 'fsRead',
                            params,
                          },
                        })
                      } catch {
                        // Let the user finish typing JSON before applying.
                      }
                    }}
                  />
                </label>
              </>
            )}

            {selectedStep.type === 'condition' && (
              <>
                <label>
                  <span>Expression</span>
                  <textarea
                    value={selectedStep.condition?.expression || ''}
                    onChange={event => handleStepPatch(selectedStep.id, {
                      condition: {
                        expression: event.target.value,
                        trueBranch: selectedStep.condition?.trueBranch || '',
                        falseBranch: selectedStep.condition?.falseBranch || '',
                      },
                    })}
                  />
                </label>
                <label>
                  <span>True Branch</span>
                  <select
                    value={selectedStep.condition?.trueBranch || ''}
                    onChange={event => handleStepPatch(selectedStep.id, {
                      condition: {
                        expression: selectedStep.condition?.expression || '',
                        trueBranch: event.target.value,
                        falseBranch: selectedStep.condition?.falseBranch || '',
                      },
                    })}
                  >
                    <option value="">-- Select --</option>
                    {workflow.steps.filter(step => step.id !== selectedStep.id).map(step => (
                      <option key={step.id} value={step.id}>{step.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>False Branch</span>
                  <select
                    value={selectedStep.condition?.falseBranch || ''}
                    onChange={event => handleStepPatch(selectedStep.id, {
                      condition: {
                        expression: selectedStep.condition?.expression || '',
                        trueBranch: selectedStep.condition?.trueBranch || '',
                        falseBranch: event.target.value,
                      },
                    })}
                  >
                    <option value="">-- Select --</option>
                    {workflow.steps.filter(step => step.id !== selectedStep.id).map(step => (
                      <option key={step.id} value={step.id}>{step.title}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <div className="card stack">
              <div className="section-title">Dependencies</div>
              {workflow.steps
                .filter(step => step.id !== selectedStep.id)
                .map(step => (
                  <label key={step.id} className="checkbox-row dependency-row">
                    <input
                      type="checkbox"
                      checked={selectedStep.dependsOn.includes(step.id)}
                      onChange={() => {
                        const exists = selectedStep.dependsOn.includes(step.id)
                        handleStepPatch(selectedStep.id, {
                          dependsOn: exists
                            ? selectedStep.dependsOn.filter(depId => depId !== step.id)
                            : [...selectedStep.dependsOn, step.id],
                        })
                      }}
                    />
                    <span>{step.title}</span>
                  </label>
                ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function normalizeWorkflow(workflow: WorkflowBlueprint): WorkflowBlueprint {
  const steps = workflow.steps.map(step => ({
    ...step,
    dependsOn: step.dependsOn.filter(depId => workflow.steps.some(item => item.id === depId && item.id !== step.id)),
  }))

  return {
    ...workflow,
    entryPoint: steps[0]?.id || '',
    steps,
    nodes: buildWorkflowNodesFromSteps(steps),
    updatedAt: new Date().toISOString(),
  }
}

function createStep(type: BlueprintNodeType, dependencyId?: string): BlueprintStep {
  const id = `${type}-${Date.now()}`
  return {
    id,
    type,
    title: defaultTitleForType(type),
    prompt: type === 'prompt' || type === 'agent' ? 'Describe the task here.' : undefined,
    dependsOn: dependencyId ? [dependencyId] : [],
    outputVar: type === 'output' ? 'final_output' : type === 'prompt' ? 'value' : undefined,
    tool: type === 'tool'
      ? {
          name: 'fsRead',
          params: { filePath: '' },
        }
      : undefined,
    condition: type === 'condition'
      ? {
          expression: 'true',
          trueBranch: '',
          falseBranch: '',
        }
      : undefined,
  }
}

function resetStepType(step: BlueprintStep, type: BlueprintNodeType): Partial<BlueprintStep> {
  return {
    type,
    prompt: type === 'prompt' || type === 'agent' ? step.prompt || 'Describe the task here.' : undefined,
    tool: type === 'tool'
      ? step.tool || { name: 'fsRead', params: { filePath: '' } }
      : undefined,
    condition: type === 'condition'
      ? step.condition || { expression: 'true', trueBranch: '', falseBranch: '' }
      : undefined,
    provider: type === 'agent' ? step.provider : undefined,
    aiNodeId: type === 'agent' ? step.aiNodeId : undefined,
    outputVar: type === 'output' ? (step.outputVar || 'final_output') : step.outputVar,
  }
}

function defaultTitleForType(type: BlueprintNodeType): string {
  switch (type) {
    case 'prompt':
      return 'Prompt Step'
    case 'agent':
      return 'Agent Step'
    case 'tool':
      return 'Tool Step'
    case 'condition':
      return 'Condition Step'
    case 'merge':
      return 'Merge Step'
    case 'output':
      return 'Output Step'
  }
}
