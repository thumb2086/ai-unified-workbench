// Workflow Engine Types

export type NodeType = 'prompt' | 'agent' | 'tool' | 'condition' | 'merge' | 'output'
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowNode {
  id: string
  type: NodeType
  name?: string
  description?: string
  
  // For 'agent' nodes
  agent?: {
    slotId?: string
    provider?: 'chatgpt' | 'gemini' | 'claude' | 'grok' | string
    aiNodeId?: string
    role?: string
  }
  
  // For 'prompt' nodes (static prompt or templated)
  prompt?: string
  
  // For 'tool' nodes
  tool?: {
    name: 'fsRead' | 'fsWrite' | 'fsList' | 'shell' | 'clipboardRead' | 'clipboardWrite'
    params: Record<string, unknown>
  }
  
  // For 'condition' nodes
  condition?: {
    expression: string  // JavaScript expression evaluating to boolean
    trueBranch: string  // node id
    falseBranch: string // node id
  }
  
  // DAG dependencies
  dependsOn?: string[]
  
  // Output handling
  outputVar?: string  // Store output to context variable
  outputTransform?: string // Transform output before passing to next node
  position?: {
    x: number
    y: number
  }
  aiNodeId?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  description?: string
  version: string
  nodes: WorkflowNode[]
  entryPoint: string  // Starting node id
}

export interface WorkflowContext {
  variables: Map<string, unknown>
  outputs: Map<string, unknown>  // node id -> output
  status: Map<string, NodeStatus>
  errors: Map<string, string>
  startTime: Date
  endTime?: Date
}

export interface WorkflowExecutionResult {
  success: boolean
  context: WorkflowContext
  finalOutput?: unknown
  error?: string
}

// Agent Types
export interface Agent {
  id: string
  slotId: string
  name: string
  provider: string
  role: 'orchestrator' | 'subagent' | 'toolagent'
  status: 'idle' | 'busy' | 'error'
}

export interface AgentMessage {
  from: string
  to: string
  type: 'task' | 'response' | 'tool_request' | 'tool_response'
  payload: unknown
  timestamp: string
}

// Webview Slot Types
export interface WebviewSlot {
  id: string
  name: string
  url: string
  sessionId: string
  provider: string
  status: 'loading' | 'ready' | 'error' | 'busy'
  createdAt: string
  lastActiveAt: string
  lastError?: string
}

// Tool Types
export type ToolName = 'fsRead' | 'fsWrite' | 'fsList' | 'shell' | 'clipboardRead' | 'clipboardWrite'

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ToolCall {
  id: string
  tool: ToolName
  params: Record<string, unknown>
  callerAgentId: string
}
