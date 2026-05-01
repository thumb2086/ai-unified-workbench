import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { executeWorkflow } from '../engine/workflow-engine'
import { useI18n } from '../hooks/useI18n'
import { useWorkbench } from '../hooks/useWorkbenchState'
import type { BlueprintNode, BlueprintNodeType, WorkflowBlueprint } from '../types/workbench'
import { toWorkflowDefinition } from '../utils/workbench'

const NODE_WIDTH = 240
const NODE_MIN_HEIGHT = 132
const PORT_RADIUS = 11
const DEFAULT_CANVAS_POINT = { x: 0, y: 0 }
const NODE_TEMPLATES: BlueprintNodeType[] = ['prompt', 'agent', 'tool', 'condition', 'merge', 'output']
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

type DragState = {
  nodeId: string
  offsetX: number
  offsetY: number
} | null

type DraftConnection = {
  fromId: string
} | null

type PanState = {
  startX: number
  startY: number
  originX: number
  originY: number
} | null

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
  const [dragState, setDragState] = useState<DragState>(null)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [draftConnection, setDraftConnection] = useState<DraftConnection>(null)
  const [pointerOnCanvas, setPointerOnCanvas] = useState(DEFAULT_CANVAS_POINT)
  const [runState, setRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [runOutput, setRunOutput] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panState, setPanState] = useState<PanState>(null)

  const workflow = useMemo(
    () => workflows.find(item => item.id === activeWorkflowId) ?? workflows[0] ?? null,
    [workflows, activeWorkflowId],
  )

  const selectedNode = workflow?.nodes.find(node => node.id === selectedNodeId) ?? null

  useEffect(() => {
    if (!workflow) return
    if (!selectedNodeId || !workflow.nodes.some(node => node.id === selectedNodeId)) {
      setSelectedNodeId(workflow.nodes[0]?.id ?? null)
    }
  }, [workflow, selectedNodeId])

  useEffect(() => {
    if (!workflow) return
    const normalized = normalizeWorkflow(workflow)
    if (normalized !== workflow) {
      updateWorkflow(workflow.id, () => normalized)
    }
  }, [workflow, updateWorkflow])

  useEffect(() => {
    if (!dragState && !draftConnection && !panState) return

    const handlePointerMove = (event: PointerEvent) => {
      if (panState) {
        setPan({
          x: panState.originX + event.clientX - panState.startX,
          y: panState.originY + event.clientY - panState.startY,
        })
        return
      }

      const point = getCanvasPoint(event.clientX, event.clientY, canvasRef.current, zoom, pan)
      if (!point) return

      setPointerOnCanvas(point)

      if (!dragState || !workflow) return

      const nextX = Math.max(24, point.x - dragState.offsetX)
      const nextY = Math.max(24, point.y - dragState.offsetY)

      setDragPositions(current => ({
        ...current,
        [dragState.nodeId]: { x: nextX, y: nextY },
      }))
    }

    const handlePointerUp = () => {
      if (dragState && dragPositions[dragState.nodeId]) {
        const nextPosition = dragPositions[dragState.nodeId]
        updateCurrentWorkflow(current => ({
          ...current,
          nodes: current.nodes.map(node =>
            node.id === dragState.nodeId
              ? { ...node, position: nextPosition }
              : node,
          ),
          updatedAt: new Date().toISOString(),
        }))
      }
      setDragState(null)
      setDragPositions({})
      setDraftConnection(null)
      setPanState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragPositions, dragState, draftConnection, pan, panState, workflow, zoom])

  const updateCurrentWorkflow = (updater: (current: WorkflowBlueprint) => WorkflowBlueprint) => {
    if (!workflow) return
    updateWorkflow(workflow.id, updater)
  }

  const addNode = (type: BlueprintNodeType) => {
    if (!workflow) return
    const now = Date.now()
    const position = {
      x: 100 + (workflow.nodes.length % 3) * 320,
      y: 120 + Math.floor(workflow.nodes.length / 3) * 180,
    }

    const node: BlueprintNode = {
      id: `${type}-${now}`,
      type,
      title: getNodeTypeLabel(type),
      dependsOn: [],
      position,
      prompt: type === 'prompt' || type === 'agent' ? t('workflow.prompt') : undefined,
      agent: type === 'agent'
        ? { provider: aiNodes.find(item => item.enabled)?.provider ?? aiNodes[0]?.provider ?? 'chatgpt' }
        : undefined,
      tool: type === 'tool' ? { name: 'fsRead', params: { filePath: '' } } : undefined,
      condition: type === 'condition'
        ? { expression: 'true', trueBranch: '', falseBranch: '' }
        : undefined,
      aiNodeId: type === 'agent' ? aiNodes.find(item => item.enabled)?.id ?? aiNodes[0]?.id : undefined,
      outputVar: type === 'prompt' ? 'value' : type === 'output' ? 'final_output' : undefined,
    }

    updateCurrentWorkflow(current => ({
      ...current,
      entryPoint: current.entryPoint || node.id,
      nodes: [...current.nodes, node],
      updatedAt: new Date().toISOString(),
    }))

    setSelectedNodeId(node.id)
  }

  const updateNode = (nodeId: string, patch: Partial<BlueprintNode>) => {
    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => node.id === nodeId ? { ...node, ...patch } : node),
      updatedAt: new Date().toISOString(),
    }))
  }

  const toggleDependency = (nodeId: string, dependencyId: string) => {
    if (!workflow) return
    const source = workflow.nodes.find(node => node.id === dependencyId)
    const target = workflow.nodes.find(node => node.id === nodeId)
    if (!source || !target || !canConnectNodes(source, target)) return

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
      const nodes = current.nodes
        .filter(node => node.id !== nodeId)
        .map(node => ({ ...node, dependsOn: node.dependsOn.filter(dep => dep !== nodeId) }))

      return {
        ...current,
        entryPoint: current.entryPoint === nodeId ? nodes[0]?.id ?? '' : current.entryPoint,
        nodes,
        updatedAt: new Date().toISOString(),
      }
    })

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
  }

  const autoLayout = () => {
    if (!workflow) return

    const levelMap = new Map<string, number>()
    const assignLevel = (node: BlueprintNode): number => {
      if (levelMap.has(node.id)) return levelMap.get(node.id) || 0
      if (!node.dependsOn.length) {
        levelMap.set(node.id, 0)
        return 0
      }
      const parentLevels = node.dependsOn
        .map(depId => workflow.nodes.find(item => item.id === depId))
        .filter(Boolean)
        .map(dep => assignLevel(dep as BlueprintNode))
      const level = Math.max(...parentLevels, 0) + 1
      levelMap.set(node.id, level)
      return level
    }

    workflow.nodes.forEach(assignLevel)

    const rowsByLevel = new Map<number, BlueprintNode[]>()
    workflow.nodes.forEach(node => {
      const level = levelMap.get(node.id) ?? 0
      rowsByLevel.set(level, [...(rowsByLevel.get(level) ?? []), node])
    })

    const sortedRows = new Map<number, BlueprintNode[]>()
    Array.from(rowsByLevel.entries()).forEach(([level, nodes]) => {
      const sorted = [...nodes].sort((a, b) => {
        const aParentY = getAverageParentY(a, workflow.nodes)
        const bParentY = getAverageParentY(b, workflow.nodes)
        return aParentY - bParentY || a.position.y - b.position.y
      })
      sortedRows.set(level, sorted)
    })

    updateCurrentWorkflow(current => ({
      ...current,
      nodes: current.nodes.map(node => {
        const level = levelMap.get(node.id) ?? 0
        const row = sortedRows.get(level) ?? []
        const index = row.findIndex(item => item.id === node.id)
        const count = Math.max(1, row.length)
        return {
          ...node,
          position: {
            x: 100 + level * 360,
            y: 240 + (Math.max(0, index) - (count - 1) / 2) * 190,
          },
        }
      }),
      updatedAt: new Date().toISOString(),
    }))
  }

  const startDrag = (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!workflow || event.button !== 0 || isInteractiveTarget(event.target)) return
    const node = workflow.nodes.find(item => item.id === nodeId)
    const point = getCanvasPoint(event.clientX, event.clientY, canvasRef.current, zoom, pan)
    if (!node || !point) return

    event.preventDefault()
    setSelectedNodeId(nodeId)
    setDragState({
      nodeId,
      offsetX: point.x - node.position.x,
      offsetY: point.y - node.position.y,
    })
  }

  const startConnection = (nodeId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    const point = getCanvasPoint(event.clientX, event.clientY, canvasRef.current, zoom, pan)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedNodeId(nodeId)
    setPointerOnCanvas(point)
    setDraftConnection({ fromId: nodeId })
  }

  const finishConnection = (nodeId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!workflow || !draftConnection || draftConnection.fromId === nodeId) return
    event.preventDefault()
    event.stopPropagation()

    const source = workflow.nodes.find(node => node.id === draftConnection.fromId)
    const target = workflow.nodes.find(node => node.id === nodeId)
    if (!source || !target || !canConnectNodes(source, target)) {
      setDraftConnection(null)
      return
    }

    if (!target.dependsOn.includes(source.id)) {
      toggleDependency(target.id, source.id)
    }
    setDraftConnection(null)
  }

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getCanvasPoint(event.clientX, event.clientY, canvasRef.current, zoom, pan)
    if (!point) return
    setPointerOnCanvas(point)
  }

  const handleZoom = (direction: 'in' | 'out') => {
    setZoom(current => clampZoom(current + (direction === 'in' ? ZOOM_STEP : -ZOOM_STEP)))
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setZoom(current => clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
  }

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveTarget(event.target) || isNodeTarget(event.target)) return
    event.preventDefault()
    setSelectedNodeId(null)
    setPanState({
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    })
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const fitToView = () => {
    if (!workflow || workflow.nodes.length === 0 || !canvasRef.current) {
      resetView()
      return
    }

    const bounds = getWorkflowBounds(workflow.nodes)
    const rect = canvasRef.current.getBoundingClientRect()
    const padding = 96
    const nextZoom = clampZoom(Math.min(
      (rect.width - padding) / bounds.width,
      (rect.height - padding) / bounds.height,
    ))

    setZoom(nextZoom)
    setPan({
      x: (rect.width - bounds.width * nextZoom) / 2 - bounds.minX * nextZoom,
      y: (rect.height - bounds.height * nextZoom) / 2 - bounds.minY * nextZoom,
    })
  }

  const handleRunWorkflow = async () => {
    if (!workflow) return
    setRunState('running')
    setRunOutput('')
    const result = await executeWorkflow(toWorkflowDefinition(workflow), { aiNodes })
    setRunState(result.success ? 'success' : 'error')
    setRunOutput(JSON.stringify(result, null, 2))
  }

  const connections = (workflow?.nodes ?? []).flatMap(node =>
    node.dependsOn
      .map(depId => {
        const source = workflow?.nodes.find(item => item.id === depId)
        return source && canConnectNodes(source, node)
          ? { from: source, to: node }
          : null
      })
      .filter(Boolean) as Array<{ from: BlueprintNode; to: BlueprintNode }>,
  )

  const previewSource = draftConnection
    ? workflow?.nodes.find(node => node.id === draftConnection.fromId) ?? null
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
            <div className="zoom-controls">
              <button onClick={() => handleZoom('out')}>-</button>
              <span className="pill subtle">{Math.round(zoom * 100)}%</span>
              <button onClick={() => handleZoom('in')}>+</button>
              <button onClick={fitToView}>適合畫面</button>
              <button onClick={resetView}>重置</button>
            </div>
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
          onPointerMove={handleCanvasPointerMove}
          onWheel={handleWheel}
          onPointerDown={startPan}
        >
          <div
            className="canvas-viewport"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
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

              {connections.map(connection => (
                <path
                  key={`${connection.from.id}-${connection.to.id}`}
                  d={buildConnectionPath(
                    getPortPosition(connection.from, 'out', dragPositions[connection.from.id]),
                    getPortPosition(connection.to, 'in', dragPositions[connection.to.id]),
                  )}
                  className="connection-line"
                  markerEnd="url(#workflow-arrow)"
                />
              ))}

              {previewSource && (
                <path
                  d={buildConnectionPath(getPortPosition(previewSource, 'out', dragPositions[previewSource.id]), pointerOnCanvas)}
                  className="connection-line drafting"
                  markerEnd="url(#workflow-preview-arrow)"
                />
              )}
            </svg>

            {(workflow?.nodes ?? []).map(node => (
              <div
                key={node.id}
                className={[
                  'workflow-node',
                  node.id === selectedNodeId ? 'selected' : '',
                  dragState?.nodeId === node.id ? 'dragging' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  left: dragPositions[node.id]?.x ?? node.position.x,
                  top: dragPositions[node.id]?.y ?? node.position.y,
                }}
                onPointerDown={event => startDrag(node.id, event)}
                onClick={() => setSelectedNodeId(node.id)}
              >
                {canAcceptIncoming(node.type) && (
                  <button
                    type="button"
                    className="port in"
                    title={t('workflow.connectTo')}
                    style={getPortStyle('in')}
                    onPointerUp={event => finishConnection(node.id, event)}
                  />
                )}

                {canEmitOutgoing(node.type) && (
                  <button
                    type="button"
                    className="port out"
                    title={t('workflow.connectFrom')}
                    style={getPortStyle('out')}
                    onPointerDown={event => startConnection(node.id, event)}
                  />
                )}

                <div className="workflow-node-top">
                  <span className="pill">{getNodeTypeLabel(node.type)}</span>
                  {node.agent?.provider && <span className="pill subtle">{node.agent.provider}</span>}
                </div>

                <div className="workflow-node-title">{node.title}</div>
                <div className="workflow-node-body">
                  {node.prompt && <p>{node.prompt}</p>}
                  {node.type === 'tool' && <p>{t('workflow.tool')}: {node.tool?.name}</p>}
                  {node.type === 'condition' && <p>{node.condition?.expression}</p>}
                  {node.type === 'prompt' && <p className="muted">{t('workflow.sourceOnly')}</p>}
                  {node.type === 'output' && <p className="muted">工作流會在這裡產生最終結果。</p>}
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
          {selectedNode && (
            <button className="danger" onClick={() => deleteNode(selectedNode.id)}>
              {t('common.delete')}
            </button>
          )}
        </div>

        {!selectedNode || !workflow ? (
          <div className="empty-state">
            <h3>{t('common.noSelection')}</h3>
            <p>{t('workflow.dragHint')}</p>
          </div>
        ) : (
          <div className="stack inspector-form">
            <label>
              <span>{t('workflow.titleLabel')}</span>
              <input
                value={selectedNode.title}
                onChange={event => updateNode(selectedNode.id, { title: event.target.value })}
              />
            </label>
            <label>
              <span>{t('common.description')}</span>
              <textarea
                value={selectedNode.description || ''}
                onChange={event => updateNode(selectedNode.id, { description: event.target.value })}
              />
            </label>
            <label>
              <span>{t('workflow.outputVar')}</span>
              <input
                value={selectedNode.outputVar || ''}
                onChange={event => updateNode(selectedNode.id, { outputVar: event.target.value })}
                placeholder="result"
              />
            </label>

            {selectedNode.type === 'agent' && (
              <>
                <label>
                  <span>{t('workflow.aiNode')}</span>
                  <select
                    value={selectedNode.aiNodeId || ''}
                    onChange={event => updateNode(selectedNode.id, { aiNodeId: event.target.value || undefined })}
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
                    value={selectedNode.prompt || ''}
                    onChange={event => updateNode(selectedNode.id, { prompt: event.target.value })}
                  />
                </label>
              </>
            )}

            {selectedNode.type === 'prompt' && (
              <label>
                <span>{t('workflow.prompt')}</span>
                <textarea
                  value={selectedNode.prompt || ''}
                  onChange={event => updateNode(selectedNode.id, { prompt: event.target.value })}
                />
              </label>
            )}

            {selectedNode.type === 'tool' && (
              <>
                <label>
                  <span>{t('workflow.tool')}</span>
                  <select
                    value={selectedNode.tool?.name ?? 'fsRead'}
                    onChange={event => updateNode(selectedNode.id, {
                      tool: {
                        name: event.target.value as NonNullable<BlueprintNode['tool']>['name'],
                        params: selectedNode.tool?.params ?? {},
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
                    value={JSON.stringify(selectedNode.tool?.params ?? {}, null, 2)}
                    onChange={event => {
                      try {
                        const params = JSON.parse(event.target.value) as Record<string, unknown>
                        updateNode(selectedNode.id, {
                          tool: {
                            name: selectedNode.tool?.name ?? 'fsRead',
                            params,
                          },
                        })
                      } catch {
                        // Keep temporary invalid JSON while the user edits.
                      }
                    }}
                  />
                </label>
              </>
            )}

            {selectedNode.type === 'condition' && (
              <>
                <label>
                  <span>{t('workflow.expression')}</span>
                  <textarea
                    value={selectedNode.condition?.expression ?? ''}
                    onChange={event => updateNode(selectedNode.id, {
                      condition: {
                        expression: event.target.value,
                        trueBranch: selectedNode.condition?.trueBranch ?? '',
                        falseBranch: selectedNode.condition?.falseBranch ?? '',
                      },
                    })}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    <span>{t('workflow.trueBranch')}</span>
                    <select
                      value={selectedNode.condition?.trueBranch ?? ''}
                      onChange={event => updateNode(selectedNode.id, {
                        condition: {
                          expression: selectedNode.condition?.expression ?? '',
                          trueBranch: event.target.value,
                          falseBranch: selectedNode.condition?.falseBranch ?? '',
                        },
                      })}
                    >
                      <option value="">--</option>
                      {workflow.nodes.filter(node => node.id !== selectedNode.id).map(node => (
                        <option key={node.id} value={node.id}>{node.title}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('workflow.falseBranch')}</span>
                    <select
                      value={selectedNode.condition?.falseBranch ?? ''}
                      onChange={event => updateNode(selectedNode.id, {
                        condition: {
                          expression: selectedNode.condition?.expression ?? '',
                          trueBranch: selectedNode.condition?.trueBranch ?? '',
                          falseBranch: event.target.value,
                        },
                      })}
                    >
                      <option value="">--</option>
                      {workflow.nodes.filter(node => node.id !== selectedNode.id).map(node => (
                        <option key={node.id} value={node.id}>{node.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            <div className="card stack">
              <div className="section-title">{t('common.dependencies')}</div>
              {selectedNode.type === 'prompt' ? (
                <div className="warning-box">
                  <strong>{t('workflow.sourceOnly')}</strong>
                  <p className="muted">{t('workflow.connectionLocked')}</p>
                </div>
              ) : (
                workflow.nodes
                  .filter(node => node.id !== selectedNode.id)
                  .map(node => {
                    const disabled = !canConnectNodes(node, selectedNode)
                    return (
                      <label key={node.id} className={`checkbox-row ${disabled ? 'disabled' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedNode.dependsOn.includes(node.id)}
                          disabled={disabled}
                          onChange={() => toggleDependency(selectedNode.id, node.id)}
                        />
                        <span>{node.title}</span>
                      </label>
                    )
                  })
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function normalizeWorkflow(workflow: WorkflowBlueprint): WorkflowBlueprint {
  let changed = false
  const nodes = workflow.nodes.map(node => {
    const validDeps = node.dependsOn.filter(depId => {
      const source = workflow.nodes.find(item => item.id === depId)
      return Boolean(source && canConnectNodes(source, node))
    })

    if (validDeps.length !== node.dependsOn.length) {
      changed = true
      return { ...node, dependsOn: validDeps }
    }

    return node
  })

  const entryPoint = nodes.some(node => node.id === workflow.entryPoint) ? workflow.entryPoint : nodes[0]?.id ?? ''
  if (entryPoint !== workflow.entryPoint) {
    changed = true
  }

  return changed
    ? {
        ...workflow,
        entryPoint,
        nodes,
        updatedAt: new Date().toISOString(),
      }
    : workflow
}

function getCanvasPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLDivElement | null,
  zoom = 1,
  pan = { x: 0, y: 0 },
) {
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left - pan.x) / zoom,
    y: (clientY - rect.top - pan.y) / zoom,
  }
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))))
}

function getNodeTypeLabel(type: BlueprintNodeType): string {
  switch (type) {
    case 'prompt':
      return '\u63d0\u793a\u8a5e'
    case 'agent':
      return '\u4ee3\u7406\u4eba'
    case 'tool':
      return '\u5de5\u5177'
    case 'condition':
      return '\u689d\u4ef6'
    case 'merge':
      return '\u5408\u4f75'
    case 'output':
      return '\u8f38\u51fa'
    default:
      return type
  }
}

function getAddLabel(t: (key: string) => string, type: BlueprintNodeType) {
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
    case 'output':
      return t('workflow.addOutput')
    default:
      return type
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('button, input, textarea, select, label, option, a'))
}

function isNodeTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('.workflow-node'))
}

function getWorkflowBounds(nodes: BlueprintNode[]) {
  const minX = Math.min(...nodes.map(node => node.position.x))
  const minY = Math.min(...nodes.map(node => node.position.y))
  const maxX = Math.max(...nodes.map(node => node.position.x + NODE_WIDTH))
  const maxY = Math.max(...nodes.map(node => node.position.y + NODE_MIN_HEIGHT + 46))

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

function getAverageParentY(node: BlueprintNode, nodes: BlueprintNode[]) {
  if (!node.dependsOn.length) return node.position.y
  const parentYs = node.dependsOn
    .map(depId => nodes.find(item => item.id === depId)?.position.y)
    .filter((value): value is number => typeof value === 'number')

  if (parentYs.length === 0) return node.position.y
  return parentYs.reduce((sum, value) => sum + value, 0) / parentYs.length
}

function canAcceptIncoming(type: BlueprintNodeType) {
  return type !== 'prompt'
}

function canEmitOutgoing(type: BlueprintNodeType) {
  return type !== 'output'
}

function canConnectNodes(source: BlueprintNode, target: BlueprintNode) {
  if (source.id === target.id) return false
  if (!canEmitOutgoing(source.type)) return false
  if (!canAcceptIncoming(target.type)) return false
  return true
}

function getPortStyle(side: 'in' | 'out') {
  return side === 'in'
    ? { left: -PORT_RADIUS, top: NODE_MIN_HEIGHT / 2 - PORT_RADIUS }
    : { right: -PORT_RADIUS, top: NODE_MIN_HEIGHT / 2 - PORT_RADIUS }
}

function getPortPosition(
  node: BlueprintNode,
  side: 'in' | 'out',
  overridePosition?: { x: number; y: number },
) {
  const position = overridePosition ?? node.position
  return {
    x: side === 'in' ? position.x : position.x + NODE_WIDTH,
    y: position.y + NODE_MIN_HEIGHT / 2,
  }
}

function buildConnectionPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const distance = Math.max(120, Math.abs(to.x - from.x) * 0.45)
  const c1x = from.x + distance
  const c2x = to.x - distance
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`
}
