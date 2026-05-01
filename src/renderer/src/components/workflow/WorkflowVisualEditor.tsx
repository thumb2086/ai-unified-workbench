import { useState, useCallback, useRef, useEffect } from 'react'
import { WorkflowDefinition, WorkflowNode, NodeType } from '../../types/workflow'
import './WorkflowVisualEditor.css'

interface NodePosition {
  id: string
  x: number
  y: number
}

interface WorkflowVisualEditorProps {
  workflow: WorkflowDefinition | null
  onWorkflowChange?: (workflow: WorkflowDefinition) => void
  readOnly?: boolean
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 80
const GRID_SIZE = 20

const NODE_COLORS: Record<NodeType, string> = {
  prompt: '#3b82f6',
  agent: '#10b981',
  tool: '#f59e0b',
  condition: '#8b5cf6',
  merge: '#ec4899',
}

const NODE_ICONS: Record<NodeType, string> = {
  prompt: '📝',
  agent: '🤖',
  tool: '🔧',
  condition: '🔀',
  merge: '🔗',
}

export function WorkflowVisualEditor({ 
  workflow, 
  onWorkflowChange,
  readOnly = false 
}: WorkflowVisualEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<NodePosition[]>([])
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Initialize positions when workflow changes
  useEffect(() => {
    if (!workflow) return
    
    // Auto-layout nodes using simple grid
    const newPositions: NodePosition[] = []
    const levels = new Map<number, string[]>()
    
    // Group nodes by dependency level
    workflow.nodes.forEach((node, index) => {
      const level = node.dependsOn?.length || 0
      if (!levels.has(level)) levels.set(level, [])
      levels.get(level)!.push(node.id)
    })
    
    // Position nodes
    let x = 50
    Array.from(levels.entries()).forEach(([level, nodeIds]) => {
      let y = 50
      nodeIds.forEach(nodeId => {
        newPositions.push({ id: nodeId, x, y })
        y += NODE_HEIGHT + 60
      })
      x += NODE_WIDTH + 100
    })
    
    setPositions(newPositions)
  }, [workflow])

  const getNodePosition = (nodeId: string) => {
    return positions.find(p => p.id === nodeId) || { x: 0, y: 0 }
  }

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return
    
    const pos = getNodePosition(nodeId)
    setDraggingNode(nodeId)
    setDragOffset({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    })
    setSelectedNode(nodeId)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }

    if (draggingNode && !readOnly) {
      setPositions(prev => prev.map(p => {
        if (p.id === draggingNode) {
          // Snap to grid
          const rawX = e.clientX - dragOffset.x
          const rawY = e.clientY - dragOffset.y
          return {
            ...p,
            x: Math.round(rawX / GRID_SIZE) * GRID_SIZE,
            y: Math.round(rawY / GRID_SIZE) * GRID_SIZE
          }
        }
        return p
      }))
    }
  }

  const handleMouseUp = () => {
    setDraggingNode(null)
  }

  const handleNodeClick = (nodeId: string) => {
    if (connectingFrom) {
      // Complete connection
      if (connectingFrom !== nodeId && workflow && onWorkflowChange) {
        const updatedNodes = workflow.nodes.map(n => {
          if (n.id === nodeId) {
            return {
              ...n,
              dependsOn: [...(n.dependsOn || []), connectingFrom]
            }
          }
          return n
        })
        onWorkflowChange({
          ...workflow,
          nodes: updatedNodes
        })
      }
      setConnectingFrom(null)
    } else {
      setSelectedNode(nodeId)
    }
  }

  const startConnection = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConnectingFrom(nodeId)
  }

  const deleteNode = (nodeId: string) => {
    if (!workflow || !onWorkflowChange) return
    
    const updatedNodes = workflow.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        dependsOn: n.dependsOn?.filter(id => id !== nodeId)
      }))
    
    onWorkflowChange({
      ...workflow,
      nodes: updatedNodes
    })
    setSelectedNode(null)
  }

  const addNode = (type: NodeType) => {
    if (!workflow || !onWorkflowChange) return
    
    const newNode: WorkflowNode = {
      id: `${type}-${Date.now()}`,
      type,
      prompt: type === 'prompt' || type === 'agent' ? 'New prompt' : undefined,
      outputVar: `output-${Date.now()}`,
    }
    
    // Position near center
    const newPosition: NodePosition = {
      id: newNode.id,
      x: 200 + Math.random() * 100,
      y: 200 + Math.random() * 100
    }
    
    onWorkflowChange({
      ...workflow,
      nodes: [...workflow.nodes, newNode]
    })
    setPositions(prev => [...prev, newPosition])
    setSelectedNode(newNode.id)
  }

  if (!workflow) {
    return (
      <div className="workflow-visual-editor empty">
        <p>No workflow loaded</p>
        <p>Select or create a workflow to start editing</p>
      </div>
    )
  }

  return (
    <div className="workflow-visual-editor">
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <span className="editor-title">{workflow.name}</span>
          <span className="editor-version">v{workflow.version}</span>
        </div>
        
        {!readOnly && (
          <div className="toolbar-center">
            <button className="tool-btn" onClick={() => addNode('prompt')} title="Add Prompt Node">
              📝 Prompt
            </button>
            <button className="tool-btn" onClick={() => addNode('agent')} title="Add Agent Node">
              🤖 Agent
            </button>
            <button className="tool-btn" onClick={() => addNode('tool')} title="Add Tool Node">
              🔧 Tool
            </button>
            <button className="tool-btn" onClick={() => addNode('condition')} title="Add Condition Node">
              🔀 Condition
            </button>
          </div>
        )}
        
        <div className="toolbar-right">
          {selectedNode && !readOnly && (
            <button 
              className="tool-btn delete"
              onClick={() => deleteNode(selectedNode)}
            >
              🗑️ Delete
            </button>
          )}
          {connectingFrom && (
            <button 
              className="tool-btn cancel"
              onClick={() => setConnectingFrom(null)}
            >
              ❌ Cancel
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div 
        ref={canvasRef}
        className="editor-canvas"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={() => { setSelectedNode(null); setConnectingFrom(null); }}
      >
        {/* Grid Background */}
        <div className="grid-background" />

        {/* Connection Lines */}
        <svg className="connections-layer">
          {workflow.nodes.map(node => {
            const fromPos = getNodePosition(node.id)
            return node.dependsOn?.map(depId => {
              const toPos = getNodePosition(depId)
              return (
                <line
                  key={`${depId}-${node.id}`}
                  x1={toPos.x + NODE_WIDTH}
                  y1={toPos.y + NODE_HEIGHT / 2}
                  x2={fromPos.x}
                  y2={fromPos.y + NODE_HEIGHT / 2}
                  className="connection-line"
                />
              )
            })
          })}
          
          {/* Connection in progress */}
          {connectingFrom && (
            <line
              x1={getNodePosition(connectingFrom).x + NODE_WIDTH / 2}
              y1={getNodePosition(connectingFrom).y + NODE_HEIGHT / 2}
              x2={mousePos.x}
              y2={mousePos.y}
              className="connection-line drafting"
            />
          )}
        </svg>

        {/* Nodes */}
        {workflow.nodes.map(node => {
          const pos = getNodePosition(node.id)
          const isSelected = selectedNode === node.id
          
          return (
            <div
              key={node.id}
              className={`workflow-node ${isSelected ? 'selected' : ''} ${node.type}`}
              style={{
                left: pos.x,
                top: pos.y,
                width: NODE_WIDTH,
                backgroundColor: NODE_COLORS[node.type]
              }}
              onMouseDown={(e) => handleMouseDown(e, node.id)}
              onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
            >
              <div className="node-header">
                <span className="node-icon">{NODE_ICONS[node.type]}</span>
                <span className="node-type">{node.type}</span>
              </div>
              <div className="node-title">{node.id}</div>
              
              {!readOnly && (
                <>
                  {/* Input port */}
                  <div className="port input" />
                  
                  {/* Output port */}
                  <div 
                    className="port output"
                    onMouseDown={(e) => startConnection(node.id, e)}
                  />
                </>
              )}
            </div>
          )
        })}

        {/* Instructions */}
        {workflow.nodes.length === 0 && (
          <div className="editor-instructions">
            <p>👈 Click the toolbar buttons to add nodes</p>
            <p>🖱️ Drag nodes to rearrange</p>
            <p>🔗 Click and drag from the output port to connect nodes</p>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="editor-statusbar">
        <span>{workflow.nodes.length} nodes</span>
        <span>{positions.length} positioned</span>
        {selectedNode && <span>Selected: {selectedNode}</span>}
        {connectingFrom && <span>Connecting from: {connectingFrom}</span>}
      </div>
    </div>
  )
}
