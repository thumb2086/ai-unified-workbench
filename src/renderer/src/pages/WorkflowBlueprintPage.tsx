import { useMemo, useState } from 'react'
import { dump as toYaml } from 'js-yaml'
import { executeWorkflow } from '../engine/workflow-engine'
import { useI18n } from '../hooks/useI18n'
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
  const { t, lang } = useI18n()
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

  const localizedTemplates = TEMPLATE_OPTIONS.map(option => ({
    ...option,
    label: localizeTemplateLabel(option.value, lang),
  }))

  return (
    <div className="page-grid workflow-page">
      <aside className="panel sidebar-panel">
        <div className="panel-head">
          <div>
            <h2>{t('workflow.title')}</h2>
            <p className="muted">{t('workflow.formSubtitle')}</p>
          </div>
        </div>

        <div className="stack">
          <button className="primary" onClick={handleCreateWorkflow}>{t('workflow.createBlueprint')}</button>
          {workflow && (
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`${t('workflow.deleteConfirmPrefix')} "${workflow.name}"?`)) {
                  deleteWorkflow(workflow.id)
                }
              }}
            >
              {t('workflow.deleteBlueprint')}
            </button>
          )}
          <button className="primary" onClick={() => void handleRunWorkflow()} disabled={!workflow}>
            {runState === 'running' ? t('workflow.runningBlueprint') : t('workflow.runBlueprint')}
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
              <span className="muted">{item.steps.length} {t('workflow.steps')}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel canvas-panel">
        {!workflow ? (
          <div className="empty-state">
            <h3>{t('workflow.noBlueprint')}</h3>
            <p>{t('workflow.createBlueprintHint')}</p>
          </div>
        ) : (
          <div className="stack">
            <div className="panel-head split">
              <div>
                <h2>{workflow.name}</h2>
                <p className="muted">{t('workflow.authorHint')}</p>
              </div>
              <div className="row">
                <button onClick={() => setPreviewMode('json')} className={previewMode === 'json' ? 'primary' : ''}>{t('workflow.previewJson')}</button>
                <button onClick={() => setPreviewMode('yaml')} className={previewMode === 'yaml' ? 'primary' : ''}>{t('workflow.previewYaml')}</button>
              </div>
            </div>

            <div className="card form-grid">
              <label>
                <span>{t('workflow.name')}</span>
                <input
                  value={workflow.name}
                  onChange={event => updateCurrentWorkflow(current => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                <span>{t('workflow.template')}</span>
                <select
                  value={workflow.templateId}
                  onChange={event => handleTemplateChange(event.target.value as BlueprintTemplateId)}
                >
                  {localizedTemplates.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('workflow.description')}</span>
                <input
                  value={workflow.description || ''}
                  onChange={event => updateCurrentWorkflow(current => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label>
                <span>{t('workflow.editorMode')}</span>
                <input value={workflow.editorMode} disabled />
              </label>
            </div>

            <div className="card stack">
              <div className="panel-head split">
                <strong>{t('workflow.blueprintSteps')}</strong>
                <div className="row">
                  {STEP_TYPE_OPTIONS.map(type => (
                    <button key={type} onClick={() => handleAddStep(type)}>
                      {t('workflow.addStep')} {type}
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
                <strong>{t('workflow.generatedPreview')}</strong>
                <span className="pill subtle">{previewMode.toUpperCase()}</span>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{previewText}</pre>
            </div>

            {runOutput && (
              <div className={`run-result ${runState}`}>
                <div className="panel-head">
                  <strong>{t('workflow.executionResult')}</strong>
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
            <h3>{t('workflow.noStep')}</h3>
            <p>{t('workflow.noStepHint')}</p>
          </div>
        ) : (
          <div className="stack inspector-form">
            <div className="panel-head split">
              <div>
                <h2>{t('workflow.stepInspector')}</h2>
                <p className="muted">{selectedStep.id}</p>
              </div>
              <div className="row">
                <button onClick={() => handleStepMove(selectedStep.id, -1)}>{t('workflow.moveUp')}</button>
                <button onClick={() => handleStepMove(selectedStep.id, 1)}>{t('workflow.moveDown')}</button>
                <button className="danger" onClick={() => handleDeleteStep(selectedStep.id)}>{t('common.delete')}</button>
              </div>
            </div>

            <label>
              <span>{t('workflow.titleLabel')}</span>
              <input
                value={selectedStep.title}
                onChange={event => handleStepPatch(selectedStep.id, { title: event.target.value })}
              />
            </label>

            <label>
              <span>{t('common.type')}</span>
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
              <span>{t('workflow.description')}</span>
              <textarea
                value={selectedStep.description || ''}
                onChange={event => handleStepPatch(selectedStep.id, { description: event.target.value })}
              />
            </label>

            <label>
              <span>{t('workflow.outputVar')}</span>
              <input
                value={selectedStep.outputVar || ''}
                onChange={event => handleStepPatch(selectedStep.id, { outputVar: event.target.value })}
                placeholder="final_output"
              />
            </label>

            {(selectedStep.type === 'prompt' || selectedStep.type === 'agent') && (
              <label>
                <span>{t('workflow.prompt')}</span>
                <textarea
                  value={selectedStep.prompt || ''}
                  onChange={event => handleStepPatch(selectedStep.id, { prompt: event.target.value })}
                />
              </label>
            )}

            {selectedStep.type === 'agent' && (
              <>
                <label>
                  <span>{t('workflow.aiNode')}</span>
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
                    <option value="">{t('workflow.selectPlaceholder')}</option>
                    {aiNodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.name} ({node.kind})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('workflow.providerOverride')}</span>
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
                  <span>{t('workflow.tool')}</span>
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
                  <span>{t('workflow.toolParamsJson')}</span>
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
                  <span>{t('workflow.expression')}</span>
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
                  <span>{t('workflow.trueBranch')}</span>
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
                    <option value="">{t('workflow.selectPlaceholder')}</option>
                    {workflow.steps.filter(step => step.id !== selectedStep.id).map(step => (
                      <option key={step.id} value={step.id}>{step.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('workflow.falseBranch')}</span>
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
                    <option value="">{t('workflow.selectPlaceholder')}</option>
                    {workflow.steps.filter(step => step.id !== selectedStep.id).map(step => (
                      <option key={step.id} value={step.id}>{step.title}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <div className="card stack">
              <div className="section-title">{t('workflow.dependenciesTitle')}</div>
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
    prompt: type === 'prompt' || type === 'agent' ? '請在這裡描述任務。' : undefined,
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
    prompt: type === 'prompt' || type === 'agent' ? step.prompt || '請在這裡描述任務。' : undefined,
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
      return '提示步驟'
    case 'agent':
      return '代理步驟'
    case 'tool':
      return '工具步驟'
    case 'condition':
      return '條件步驟'
    case 'merge':
      return '合併步驟'
    case 'output':
      return '輸出步驟'
  }
}

function localizeTemplateLabel(templateId: BlueprintTemplateId, lang: 'zh' | 'en'): string {
  if (lang === 'en') {
    return TEMPLATE_OPTIONS.find(option => option.value === templateId)?.label || templateId
  }

  switch (templateId) {
    case 'custom':
      return '自訂'
    case 'prompt-chain':
      return '簡單提示鏈'
    case 'broadcast':
      return '廣播'
    case 'relay':
      return '接力'
    case 'debate':
      return '辯論'
    case 'subagent':
      return '子代理'
    default:
      return templateId
  }
}
