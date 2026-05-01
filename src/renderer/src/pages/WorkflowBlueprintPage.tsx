import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useWorkbench } from '../hooks/useWorkbenchState'
import { useI18n } from '../hooks/useI18n'
import type { BlueprintNode, BlueprintNodeType, WorkflowBlueprint } from '../types/workbench'
import { executeWorkflow } from '../engine/workflow-engine'
import { toWorkflowDefinition } from '../utils/workbench'

const NODE_SIZE = { width: 220, height: 118 }

const NODE_TEMPLATES: Array<{ type: BlueprintNodeType; label: string }> = [
  { type: 'prompt', label: 'Prompt' },
  { type: 'agent', label: 'Agent' },
  { type: 'tool', label: 'Tool' },
  { type: 'condition', label: 'Condition' },
  { type: 'merge', label: 'Merge' },
]

export function WorkflowBlueprintPage() {
  const { t } = useI18n()
  const {
    workflows,
    aiNodes,
    activeWorkflowId,
    setActiveWorkflowId,
    addWorkflow,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkbench()
  const canvasRef = useRef<HTMLDivElement>(null)
  const workflow = useMemo(
    () => workflows.find(item => item.id === activeWorkflowId) ?? workflows[0] ?? null,
    [workflows, activeWorkflowId],
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [runState, setRunState] = useState<string>('')
  const [runOutput, setRunOutput] = useState<string>('')

  const currentNode = workflow?.nodes.find(node => node.id === selectedNodeId) ?? null

  const updateCurrentWorkflow = (updater: (workflow: WorkflowBlueprint) => WorkflowBlueprint) => {
    if (!workflow) return
    updateWorkflow(workflow.id, updater)
  }

  const addNode = (type: BlueprintNodeType) => {
    if (!workflow) return
    const now = Date.now()
    const x = 80 + (workflow.nodes.length % 3) * 260
    const y = 120 + Math.floor(workflow.nodes.length / 3) * 170
    const base: BlueprintNode = {
      id: `${type}-${now}`,
      type,
      title: `${type[0].toUpperCase()}${type.slice(1)} node`,
      dependsOn: [],
      position: { x, y },
    }

    if (type === 'prompt' || type === 'agent') {
      base.prompt = 'New prompt'
    }
    if (type === 'agent') {
      base.aiNodeId = aiNodes.find(node => node.enabled)?.id ?? aiNodes[0]?.id
    }

    if (type === 'tool') {
      base.tool = { name: 'fsRead', params: { filePath: '' } }
    }

    if (type === 'condition') {
      base.condition = { expression: 'true', trueBranch: '', falseBranch: '' }
    }

    updateCurrentWorkflow(current => ({
      ...current,
      entryPoint: current.entryPoint || base.id,
      nodes: [...current.nodes, base],
      updatedAt: new Date().toISOString(),
    }))
    setSelectedNodeId(base.id)
  }

  const autoLayout = () => {
    if (!workflow) return
    const byLevel = new Map<number, BlueprintNode[]>()
    workflow.nodes.forEach(node => {
      const level = node.dependsOn.length
      byLevel.set(level, [...(byLevel.get(level) ?? []), node])
    })

    const nodes = workflow.nodes.map(node => node)
    byLevel.forEach((items, level) => {
      items.forEach((node, index) => {
        const target = nodes.find(item => item.id === node.id)
        if (target) {
          target.position = {
            x: 80 + level * 300,
            y: 100 + index * 180,
          }
        }
      })
    })

    updateCurrentWorkflow(current => ({
      ...current,
      nodes: nodes.map(node => ({ ...node, position: { ...node.position } })),
      updatedAt: new Date().toISOString(),
    }))
  }

  const updateNode = (nodeId: string, patch: Partial<BlueprintNode>) => {
    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => (node.id === nodeId ? { ...node, ...patch } : node)),
      updatedAt: new Date().toISOString(),
    }))
  }

  const toggleDependency = (nodeId: string, dependencyId: string) => {
    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => {
        if (node.id !== nodeId) return node
        const hasDependency = node.dependsOn.includes(dependencyId)
        return {
          ...node,
          dependsOn: hasDependency
            ? node.dependsOn.filter(item => item !== dependencyId)
            : [...node.dependsOn, dependencyId],
        }
      }),
      updatedAt: new Date().toISOString(),
    }))
  }

  const deleteNode = (nodeId: string) => {
    if (!workflow) return
    updateCurrentWorkflow(current => {
      const nextNodes = current.nodes.filter(node => node.id !== nodeId).map(node => ({
        ...node,
        dependsOn: node.dependsOn.filter(dep => dep !== nodeId),
      }))
      return {
        ...current,
        entryPoint: current.entryPoint === nodeId ? nextNodes[0]?.id || '' : current.entryPoint,
        nodes: nextNodes,
        updatedAt: new Date().toISOString(),
      }
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  const startDrag = (nodeId: string, event: ReactMouseEvent) => {
    if (!workflow) return
    const node = workflow.nodes.find(item => item.id === nodeId)
    if (!node) return
    setDraggingId(nodeId)
    setSelectedNodeId(nodeId)
    setDragOffset({
      x: event.clientX - node.position.x,
      y: event.clientY - node.position.y,
    })
  }

  const handleMove = (event: React.MouseEvent) => {
    if (!draggingId || !workflow) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(20, event.clientX - rect.left - dragOffset.x)
    const y = Math.max(20, event.clientY - rect.top - dragOffset.y)
    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node =>
        node.id === draggingId
          ? { ...node, position: { x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 } }
          : node,
      ),
      updatedAt: new Date().toISOString(),
    }))
  }

  const handleUp = () => setDraggingId(null)

  const handleNodeClick = (nodeId: string) => {
    if (!workflow) return
    if (connectFrom && connectFrom !== nodeId) {
      const target = workflow.nodes.find(node => node.id === nodeId)
      if (target && !target.dependsOn.includes(connectFrom)) {
        toggleDependency(nodeId, connectFrom)
      }
      setConnectFrom(null)
      return
    }
    setSelectedNodeId(nodeId)
  }

  const runCurrentWorkflow = async () => {
    if (!workflow) return
    setRunState('running')
    setRunOutput('')
    const result = await executeWorkflow(toWorkflowDefinition(workflow), { aiNodes })
    setRunState(result.success ? 'success' : 'error')
    setRunOutput(JSON.stringify(result, null, 2))
  }

  const selectedIndex = workflow?.nodes.findIndex(node => node.id === selectedNodeId) ?? -1

  return (
    <div className="page-grid workflow-page">
      <aside className="panel sidebar-panel">
        <div className="panel-head">
          <div>
            <h2>{t('workflow.title')}</h2>
            <p className="muted">{t('workflow.subtitle')}</p>
          </div>
        </div>

        <div className="stack">
          <button className="primary" onClick={() => setActiveWorkflowId(addWorkflow().id)}>
            {t('workflow.create')}
          </button>
          {workflow && (
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Delete workflow "${workflow.name}"?`)) {
                  deleteWorkflow(workflow.id)
                }
              }}
            >
              {t('common.delete')}
            </button>
          )}
          <button onClick={autoLayout}>{t('workflow.autoLayout')}</button>
          <button className="primary" onClick={() => void runCurrentWorkflow()}>
            {t('workflow.run')}
          </button>
        </div>

        <div className="workflow-list">
          {workflows.map(item => (
            <button
              key={item.id}
              className={`workflow-list-item ${item.id === workflow?.id ? 'active' : ''}`}
              onClick={() => setActiveWorkflowId(item.id)}
            >
              <strong>{item.name}</strong>
              <span className="muted">{item.nodes.length} nodes</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel canvas-panel">
        <div className="panel-head split">
          <div>
            <h2>{workflow?.name ?? t('workflow.title')}</h2>
            <p className="muted">{t('workflow.connectHint')}</p>
          </div>
          <div className="row">
            {NODE_TEMPLATES.map(item => (
              <button key={item.type} onClick={() => addNode(item.type)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {workflow && (
          <div className="card form-grid">
            <label>
              <span>Name</span>
              <input
                value={workflow.name}
                onChange={event => updateCurrentWorkflow(current => ({
                  ...current,
                  name: event.target.value,
                  updatedAt: new Date().toISOString(),
                }))}
              />
            </label>
            <label>
              <span>Description</span>
              <input
                value={workflow.description || ''}
                onChange={event => updateCurrentWorkflow(current => ({
                  ...current,
                  description: event.target.value,
                  updatedAt: new Date().toISOString(),
                }))}
              />
            </label>
          </div>
        )}

        <div
          ref={canvasRef}
          className="workflow-canvas"
          onMouseMove={handleMove}
          onMouseUp={handleUp}
          onMouseLeave={handleUp}
        >
          <div className="grid-overlay" />
          {workflow?.nodes.map(node => (
            <NodeConnectionLines
              key={`${workflow.id}-${node.id}`}
              workflow={workflow}
              node={node}
            />
          ))}

          {workflow?.nodes.map(node => (
            <div
              key={node.id}
              className={`workflow-node ${node.id === selectedNodeId ? 'selected' : ''} ${connectFrom === node.id ? 'connecting' : ''}`}
              style={{ left: node.position.x, top: node.position.y }}
              onMouseDown={event => startDrag(node.id, event)}
              onClick={() => handleNodeClick(node.id)}
            >
              <div className="workflow-node-top">
                <span className="pill">{node.type}</span>
                {node.aiNodeId && <span className="pill subtle">{node.aiNodeId}</span>}
              </div>
              <div className="workflow-node-title">{node.title}</div>
              <div className="workflow-node-body">
                {node.prompt && <p>{node.prompt}</p>}
                {node.type === 'tool' && <p>Tool: {node.tool?.name}</p>}
                {node.type === 'condition' && <p>{node.condition?.expression}</p>}
              </div>
              <button
                className="node-connect-btn"
                onClick={event => {
                  event.stopPropagation()
                  setConnectFrom(node.id)
                }}
              >
                Link
              </button>
            </div>
          ))}

          {!workflow?.nodes.length && (
            <div className="empty-state canvas-empty">
              <h3>{t('common.noSelection')}</h3>
              <p>{t('workflow.subtitle')}</p>
            </div>
          )}
        </div>

        {runOutput && (
          <div className={`run-result ${runState}`}>
            <div className="panel-head">
              <strong>{t('workflow.run')}</strong>
              <span className={`pill ${runState}`}>{runState}</span>
            </div>
            <pre>{runOutput}</pre>
          </div>
        )}
      </section>

      <aside className="panel inspector-panel">
        <div className="panel-head">
          <div>
            <h2>{t('workflow.inspector')}</h2>
            <p className="muted">{t('workflow.connectHint')}</p>
          </div>
          {currentNode && (
            <button className="danger" onClick={() => deleteNode(currentNode.id)}>
              {t('common.delete')}
            </button>
          )}
        </div>

        {!currentNode || !workflow ? (
          <div className="empty-state">
            <h3>{t('common.noSelection')}</h3>
            <p>{t('workflow.subtitle')}</p>
          </div>
        ) : (
          <div className="stack inspector-form">
            <label>
              <span>Title</span>
              <input value={currentNode.title} onChange={event => updateNode(currentNode.id, { title: event.target.value })} />
            </label>
            <label>
              <span>Description</span>
              <textarea value={currentNode.description || ''} onChange={event => updateNode(currentNode.id, { description: event.target.value })} />
            </label>
            <label>
              <span>Output variable</span>
              <input
                value={currentNode.outputVar || ''}
                onChange={event => updateNode(currentNode.id, { outputVar: event.target.value })}
                placeholder="result"
              />
            </label>
            {currentNode.type === 'agent' && (
              <>
                <label>
                  <span>AI Node</span>
                  <select
                    value={currentNode.aiNodeId || ''}
                    onChange={event => updateNode(currentNode.id, { aiNodeId: event.target.value || undefined })}
                  >
                    <option value="">--</option>
                    {aiNodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.name} ({node.kind})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Prompt</span>
                  <textarea
                    value={currentNode.prompt || ''}
                    onChange={event => updateNode(currentNode.id, { prompt: event.target.value })}
                  />
                </label>
              </>
            )}
            {currentNode.type === 'prompt' && (
              <label>
                <span>Prompt</span>
                <textarea
                  value={currentNode.prompt || ''}
                  onChange={event => updateNode(currentNode.id, { prompt: event.target.value })}
                />
              </label>
            )}
            {currentNode.type === 'tool' && (
              <>
                <div className="form-grid">
                  <label>
                    <span>Tool</span>
                    <select
                      value={currentNode.tool?.name ?? 'fsRead'}
                      onChange={event => updateNode(currentNode.id, {
                        tool: {
                          name: event.target.value as NonNullable<BlueprintNode['tool']>['name'],
                          params: currentNode.tool?.params ?? {},
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
                </div>
                <label>
                  <span>Tool params JSON</span>
                  <textarea
                    value={JSON.stringify(currentNode.tool?.params ?? {}, null, 2)}
                    onChange={event => {
                      try {
                        const params = JSON.parse(event.target.value) as Record<string, unknown>
                        updateNode(currentNode.id, {
                          tool: {
                            name: currentNode.tool?.name ?? 'fsRead',
                            params,
                          },
                        })
                      } catch {
                        // Let the user keep editing invalid JSON without breaking the form.
                      }
                    }}
                  />
                </label>
              </>
            )}
            {currentNode.type === 'condition' && (
              <>
                <label>
                  <span>Expression</span>
                  <textarea
                    value={currentNode.condition?.expression ?? ''}
                    onChange={event => updateNode(currentNode.id, {
                      condition: {
                        expression: event.target.value,
                        trueBranch: currentNode.condition?.trueBranch ?? '',
                        falseBranch: currentNode.condition?.falseBranch ?? '',
                      },
                    })}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    <span>True branch</span>
                    <select
                      value={currentNode.condition?.trueBranch ?? ''}
                      onChange={event => updateNode(currentNode.id, {
                        condition: {
                          expression: currentNode.condition?.expression ?? '',
                          trueBranch: event.target.value,
                          falseBranch: currentNode.condition?.falseBranch ?? '',
                        },
                      })}
                    >
                      <option value="">--</option>
                      {workflow.nodes.filter(node => node.id !== currentNode.id).map(node => (
                        <option key={node.id} value={node.id}>{node.title}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>False branch</span>
                    <select
                      value={currentNode.condition?.falseBranch ?? ''}
                      onChange={event => updateNode(currentNode.id, {
                        condition: {
                          expression: currentNode.condition?.expression ?? '',
                          trueBranch: currentNode.condition?.trueBranch ?? '',
                          falseBranch: event.target.value,
                        },
                      })}
                    >
                      <option value="">--</option>
                      {workflow.nodes.filter(node => node.id !== currentNode.id).map(node => (
                        <option key={node.id} value={node.id}>{node.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            <div className="card stack">
              <div className="section-title">Dependencies</div>
              {workflow.nodes.filter(node => node.id !== currentNode.id).map(node => (
                <label key={node.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={currentNode.dependsOn.includes(node.id)}
                    onChange={() => toggleDependency(currentNode.id, node.id)}
                  />
                  <span>{node.title}</span>
                </label>
              ))}
              {selectedIndex >= 0 && (
                <button
                  onClick={() => {
                    if (connectFrom && connectFrom !== currentNode.id) {
                      toggleDependency(currentNode.id, connectFrom)
                      setConnectFrom(null)
                    } else {
                      setConnectFrom(currentNode.id)
                    }
                  }}
                >
                  {connectFrom === currentNode.id ? t('common.cancel') : 'Link from here'}
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function NodeConnectionLines({ workflow, node }: { workflow: WorkflowBlueprint; node: BlueprintNode }) {
  const x2 = node.position.x + NODE_SIZE.width / 2
  const y2 = node.position.y
  return (
    <svg className="connection-layer">
      {node.dependsOn.map(depId => {
        const dep = workflow.nodes.find(item => item.id === depId)
        if (!dep) return null
        const x1 = dep.position.x + NODE_SIZE.width / 2
        const y1 = dep.position.y + NODE_SIZE.height
        return (
          <line
            key={`${depId}-${node.id}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className="connection-line"
          />
        )
      })}
    </svg>
  )
}
