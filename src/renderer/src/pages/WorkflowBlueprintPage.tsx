import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useWorkbench } from '../hooks/useWorkbenchState'
import { useI18n } from '../hooks/useI18n'
import type { BlueprintNode, BlueprintNodeType, WorkflowBlueprint } from '../types/workbench'
import { executeWorkflow } from '../engine/workflow-engine'
import { toWorkflowDefinition } from '../utils/workbench'

const NODE_SIZE = { width: 220, height: 118 }
const PORT_CENTER = 20
const NODE_TEMPLATES: BlueprintNodeType[] = ['prompt', 'agent', 'tool', 'condition', 'merge']

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [runState, setRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [runOutput, setRunOutput] = useState('')

  const workflow = useMemo(
    () => workflows.find(item => item.id === activeWorkflowId) ?? workflows[0] ?? null,
    [workflows, activeWorkflowId],
  )

  const currentNode = workflow?.nodes.find(node => node.id === selectedNodeId) ?? null

  useEffect(() => {
    if (!workflow) return
    if (!selectedNodeId || !workflow.nodes.some(node => node.id === selectedNodeId)) {
      setSelectedNodeId(workflow.nodes[0]?.id ?? null)
    }
  }, [workflow, selectedNodeId])

  useEffect(() => {
    if (!draggingId && !connectFrom) return

    const handleWindowMove = (event: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      setMousePos({ x, y })

      if (!draggingId || !workflow) return
      const nextX = Math.max(20, x - dragOffset.x)
      const nextY = Math.max(20, y - dragOffset.y)

      updateCurrentWorkflow(current => ({
        ...current,
        nodes: current.nodes.map(node =>
          node.id === draggingId
            ? { ...node, position: { x: Math.round(nextX / 10) * 10, y: Math.round(nextY / 10) * 10 } }
            : node,
        ),
        updatedAt: new Date().toISOString(),
      }))
    }

    const handleWindowUp = () => setDraggingId(null)

    window.addEventListener('mousemove', handleWindowMove)
    window.addEventListener('mouseup', handleWindowUp)
    return () => {
      window.removeEventListener('mousemove', handleWindowMove)
      window.removeEventListener('mouseup', handleWindowUp)
    }
  }, [connectFrom, dragOffset.x, dragOffset.y, draggingId, workflow])

  const updateCurrentWorkflow = (updater: (workflow: WorkflowBlueprint) => WorkflowBlueprint) => {
    if (!workflow) return
    updateWorkflow(workflow.id, updater)
  }

  const addNode = (type: BlueprintNodeType) => {
    if (!workflow) return
    const now = Date.now()
    const position = {
      x: 80 + (workflow.nodes.length % 3) * 260,
      y: 120 + Math.floor(workflow.nodes.length / 3) * 170,
    }

    const node: BlueprintNode = {
      id: `${type}-${now}`,
      type,
      title: getNodeTypeLabel(type),
      dependsOn: [],
      position,
      prompt: type === 'prompt' || type === 'agent' ? t('workflow.prompt') : undefined,
      tool: type === 'tool' ? { name: 'fsRead', params: { filePath: '' } } : undefined,
      condition: type === 'condition'
        ? { expression: 'true', trueBranch: '', falseBranch: '' }
        : undefined,
      aiNodeId: type === 'agent' ? aiNodes.find(node => node.enabled)?.id ?? aiNodes[0]?.id : undefined,
    }

    updateCurrentWorkflow(current => ({
      ...current,
      entryPoint: current.entryPoint || node.id,
      nodes: [...current.nodes, node],
      updatedAt: new Date().toISOString(),
    }))
    setSelectedNodeId(node.id)
  }

  const autoLayout = () => {
    if (!workflow) return
    const grouped = new Map<number, BlueprintNode[]>()
    workflow.nodes.forEach(node => {
      const level = node.dependsOn.length
      grouped.set(level, [...(grouped.get(level) ?? []), node])
    })

    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => {
        const level = node.dependsOn.length
        const index = (grouped.get(level) ?? []).findIndex(item => item.id === node.id)
        return {
          ...node,
          position: {
            x: 80 + level * 300,
            y: 100 + Math.max(0, index) * 180,
          },
        }
      }),
      updatedAt: new Date().toISOString(),
    }))
  }

  const updateNode = (nodeId: string, patch: Partial<BlueprintNode>) => {
    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => node.id === nodeId ? { ...node, ...patch } : node),
      updatedAt: new Date().toISOString(),
    }))
  }

  const toggleDependency = (nodeId: string, dependencyId: string) => {
    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => {
        if (node.id !== nodeId) return node
        const exists = node.dependsOn.includes(dependencyId)
        return {
          ...node,
          dependsOn: exists
            ? node.dependsOn.filter(id => id !== dependencyId)
            : [...node.dependsOn, dependencyId],
        }
      }),
      updatedAt: new Date().toISOString(),
    }))
  }

  const deleteNode = (nodeId: string) => {
    if (!workflow) return
    updateCurrentWorkflow(current => {
      const nextNodes = current.nodes
        .filter(node => node.id !== nodeId)
        .map(node => ({ ...node, dependsOn: node.dependsOn.filter(dep => dep !== nodeId) }))

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
    if (!workflow || event.button !== 0 || isInteractiveTarget(event.target)) return
    const node = workflow.nodes.find(item => item.id === nodeId)
    if (!node) return
    setDraggingId(nodeId)
    setSelectedNodeId(nodeId)
    setDragOffset({
      x: event.clientX - node.position.x,
      y: event.clientY - node.position.y,
    })
  }

  const handleCanvasMouseMove = (event: ReactMouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setMousePos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  const handleConnectStart = (nodeId: string) => {
    setConnectFrom(nodeId)
    setSelectedNodeId(nodeId)
  }

  const handleConnectFinish = (nodeId: string) => {
    if (!workflow || !connectFrom || connectFrom === nodeId) return
    const target = workflow.nodes.find(node => node.id === nodeId)
    if (target && !target.dependsOn.includes(connectFrom)) {
      toggleDependency(nodeId, connectFrom)
    }
    setConnectFrom(null)
  }

  const handleRunWorkflow = async () => {
    if (!workflow) return
    setRunState('running')
    setRunOutput('')
    const result = await executeWorkflow(toWorkflowDefinition(workflow), { aiNodes })
    setRunState(result.success ? 'success' : 'error')
    setRunOutput(JSON.stringify(result, null, 2))
  }

  const connections = workflow?.nodes.flatMap(node =>
    node.dependsOn.map(depId => ({ fromId: depId, toId: node.id })),
  ) ?? []

  const previewSource = connectFrom
    ? workflow?.nodes.find(node => node.id === connectFrom) ?? null
    : null

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
                if (window.confirm(`${t('workflow.deleteWorkflow')} "${workflow.name}"?`)) {
                  deleteWorkflow(workflow.id)
                }
              }}
            >
              {t('common.delete')}
            </button>
          )}
          <button onClick={autoLayout}>{t('workflow.autoLayout')}</button>
          <button className="primary" onClick={() => void handleRunWorkflow()}>
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
              <span className="muted">{item.nodes.length} {t('common.nodesCount')}</span>
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
            {NODE_TEMPLATES.map(type => (
              <button key={type} onClick={() => addNode(type)}>
                {getAddLabel(t, type)}
              </button>
            ))}
          </div>
        </div>

        {workflow && (
          <div className="card form-grid">
            <label>
              <span>{t('workflow.name')}</span>
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
              <span>{t('workflow.description')}</span>
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
          onMouseMove={handleCanvasMouseMove}
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setSelectedNodeId(null)
            }
          }}
        >
          <div className="grid-overlay" />

          <svg className="connection-layer">
            <defs>
              <marker
                id="workflow-arrow"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L12,6 L0,12 z" fill="rgba(96, 165, 250, 0.95)" />
              </marker>
              <marker
                id="workflow-preview-arrow"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L12,6 L0,12 z" fill="rgba(34, 197, 94, 0.95)" />
              </marker>
            </defs>

            {connections.map(connection => {
              const source = workflow?.nodes.find(node => node.id === connection.fromId)
              const target = workflow?.nodes.find(node => node.id === connection.toId)
              if (!source || !target) return null

              const start = getPortPosition(source, 'out')
              const end = getPortPosition(target, 'in')
              return (
                <path
                  key={`${connection.fromId}-${connection.toId}`}
                  d={buildConnectionPath(start, end)}
                  className="connection-line"
                  markerEnd="url(#workflow-arrow)"
                />
              )
            })}

            {previewSource && (
              <path
                d={buildConnectionPath(getPortPosition(previewSource, 'out'), mousePos)}
                className="connection-line drafting"
                markerEnd="url(#workflow-preview-arrow)"
              />
            )}
          </svg>

          {workflow?.nodes.map(node => (
            <div
              key={node.id}
              className={`workflow-node ${node.id === selectedNodeId ? 'selected' : ''} ${connectFrom === node.id ? 'connecting' : ''}`}
              style={{ left: node.position.x, top: node.position.y }}
              onMouseDown={event => startDrag(node.id, event)}
              onClick={() => setSelectedNodeId(node.id)}
            >
              <div className="workflow-node-top">
                <span className="pill">{getNodeTypeLabel(node.type)}</span>
                {node.aiNodeId && <span className="pill subtle">{node.aiNodeId}</span>}
              </div>

              <div className="workflow-node-title">{node.title}</div>
              <div className="workflow-node-body">
                {node.prompt && <p>{node.prompt}</p>}
                {node.type === 'tool' && <p>{t('workflow.tool')}: {node.tool?.name}</p>}
                {node.type === 'condition' && <p>{node.condition?.expression}</p>}
              </div>

              <div className="node-ports">
                <button
                  type="button"
                  className="port out"
                  title={t('workflow.connectFrom')}
                  onClick={event => {
                    event.stopPropagation()
                    handleConnectStart(node.id)
                  }}
                />
                <button
                  type="button"
                  className="port in"
                  title={t('workflow.connectTo')}
                  onClick={event => {
                    event.stopPropagation()
                    handleConnectFinish(node.id)
                  }}
                />
              </div>
            </div>
          ))}

          {!workflow?.nodes.length && (
            <div className="empty-state canvas-empty">
              <h3>{t('common.noSelection')}</h3>
              <p>{t('workflow.dragHint')}</p>
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
            <p className="muted">{t('workflow.dragHint')}</p>
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
            <p>{t('workflow.dragHint')}</p>
          </div>
        ) : (
          <div className="stack inspector-form">
            <label>
              <span>{t('workflow.titleLabel')}</span>
              <input
                value={currentNode.title}
                onChange={event => updateNode(currentNode.id, { title: event.target.value })}
              />
            </label>
            <label>
              <span>{t('common.description')}</span>
              <textarea
                value={currentNode.description || ''}
                onChange={event => updateNode(currentNode.id, { description: event.target.value })}
              />
            </label>
            <label>
              <span>{t('workflow.outputVar')}</span>
              <input
                value={currentNode.outputVar || ''}
                onChange={event => updateNode(currentNode.id, { outputVar: event.target.value })}
                placeholder="result"
              />
            </label>

            {currentNode.type === 'agent' && (
              <>
                <label>
                  <span>{t('workflow.aiNode')}</span>
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
                  <span>{t('workflow.prompt')}</span>
                  <textarea
                    value={currentNode.prompt || ''}
                    onChange={event => updateNode(currentNode.id, { prompt: event.target.value })}
                  />
                </label>
              </>
            )}

            {currentNode.type === 'prompt' && (
              <label>
                <span>{t('workflow.prompt')}</span>
                <textarea
                  value={currentNode.prompt || ''}
                  onChange={event => updateNode(currentNode.id, { prompt: event.target.value })}
                />
              </label>
            )}

            {currentNode.type === 'tool' && (
              <>
                <label>
                  <span>{t('workflow.tool')}</span>
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
                <label>
                  <span>{t('workflow.toolParams')}</span>
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
                        // allow temporary invalid JSON while editing
                      }
                    }}
                  />
                </label>
              </>
            )}

            {currentNode.type === 'condition' && (
              <>
                <label>
                  <span>{t('workflow.expression')}</span>
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
                    <span>{t('workflow.trueBranch')}</span>
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
                    <span>{t('workflow.falseBranch')}</span>
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
              <div className="section-title">{t('common.dependencies')}</div>
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
                {connectFrom === currentNode.id ? t('common.cancel') : t('workflow.linkFrom')}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function getNodeTypeLabel(type: BlueprintNodeType): string {
  switch (type) {
    case 'prompt':
      return '提示詞'
    case 'agent':
      return '代理人'
    case 'tool':
      return '工具'
    case 'condition':
      return '條件'
    case 'merge':
      return '合併'
    default:
      return type
  }
}

function getAddLabel(t: (key: string) => string, type: BlueprintNodeType): string {
  switch (type) {
    case 'prompt':
      return t('workflow.addPrompt')
    case 'agent':
      return t('workflow.addAgent')
    case 'tool':
      return t('workflow.addTool')
    case 'condition':
      return t('workflow.addCondition')
    case 'merge':
      return t('workflow.addMerge')
    default:
      return type
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('button, input, textarea, select, label, option, a'))
}

function getPortPosition(node: BlueprintNode, side: 'in' | 'out') {
  return {
    x: side === 'in'
      ? node.position.x + PORT_CENTER
      : node.position.x + NODE_SIZE.width - PORT_CENTER,
    y: node.position.y + NODE_SIZE.height - PORT_CENTER,
  }
}

function buildConnectionPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = Math.max(120, Math.abs(to.x - from.x) * 0.5)
  const c1x = from.x + dx
  const c1y = from.y
  const c2x = to.x - dx
  const c2y = to.y
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`
}
