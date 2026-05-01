import { WorkflowContext, WorkflowNode, NodeStatus, ToolCall, ToolName } from '../types/workflow'

/**
 * Execution Context - Manages workflow execution state
 */

export class ExecutionContext {
  private context: WorkflowContext
  private onUpdate?: (context: WorkflowContext) => void

  constructor() {
    this.context = {
      variables: new Map(),
      outputs: new Map(),
      status: new Map(),
      errors: new Map(),
      startTime: new Date()
    }
  }

  /**
   * Set a callback for context updates
   */
  setUpdateCallback(callback: (context: WorkflowContext) => void): void {
    this.onUpdate = callback
  }

  /**
   * Get the current context
   */
  getContext(): WorkflowContext {
    return this.context
  }

  /**
   * Set node status
   */
  setNodeStatus(nodeId: string, status: NodeStatus): void {
    this.context.status.set(nodeId, status)
    this.notifyUpdate()
  }

  /**
   * Get node status
   */
  getNodeStatus(nodeId: string): NodeStatus {
    return this.context.status.get(nodeId) || 'pending'
  }

  /**
   * Store node output
   */
  setNodeOutput(nodeId: string, output: unknown): void {
    this.context.outputs.set(nodeId, output)
    this.notifyUpdate()
  }

  /**
   * Get node output
   */
  getNodeOutput(nodeId: string): unknown {
    return this.context.outputs.get(nodeId)
  }

  /**
   * Set variable
   */
  setVariable(name: string, value: unknown): void {
    this.context.variables.set(name, value)
    this.notifyUpdate()
  }

  /**
   * Get variable
   */
  getVariable(name: string): unknown {
    return this.context.variables.get(name)
  }

  /**
   * Set error for node
   */
  setNodeError(nodeId: string, error: string): void {
    this.context.errors.set(nodeId, error)
    this.setNodeStatus(nodeId, 'failed')
  }

  /**
   * Get node error
   */
  getNodeError(nodeId: string): string | undefined {
    return this.context.errors.get(nodeId)
  }

  /**
   * Check if all nodes are complete
   */
  isComplete(nodeIds: string[]): boolean {
    for (const id of nodeIds) {
      const status = this.getNodeStatus(id)
      if (status === 'pending' || status === 'running') {
        return false
      }
    }
    return true
  }

  /**
   * Check if any node failed
   */
  hasErrors(): boolean {
    for (const status of this.context.status.values()) {
      if (status === 'failed') {
        return true
      }
    }
    return false
  }

  /**
   * Finish execution
   */
  finish(finalOutput?: unknown): void {
    this.context.endTime = new Date()
    if (finalOutput !== undefined) {
      this.context.variables.set('__final__', finalOutput)
    }
    this.notifyUpdate()
  }

  /**
   * Build execution summary
   */
  getSummary(): {
    duration: number
    completed: number
    failed: number
    total: number
  } {
    const end = this.context.endTime || new Date()
    const duration = end.getTime() - this.context.startTime.getTime()

    let completed = 0
    let failed = 0

    for (const status of this.context.status.values()) {
      if (status === 'completed') completed++
      if (status === 'failed') failed++
    }

    return {
      duration,
      completed,
      failed,
      total: this.context.status.size
    }
  }

  private notifyUpdate(): void {
    this.onUpdate?.(this.context)
  }
}

/**
 * Template engine for variable substitution
 */
export function renderTemplate(template: string, context: ExecutionContext): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, key) => {
    const trimmed = key.trim()
    
    // Check if it's a node output reference (e.g., "node-1.output")
    if (trimmed.includes('.')) {
      const [nodeId, ...rest] = trimmed.split('.')
      const output = context.getNodeOutput(nodeId)
      if (typeof output === 'object' && output !== null) {
        return String((output as Record<string, unknown>)[rest.join('.')] ?? match)
      }
      return String(output ?? match)
    }

    // Check variables
    const value = context.getVariable(trimmed)
    if (value !== undefined) {
      return String(value)
    }

    // Return original if not found
    return match
  })
}

/**
 * Evaluate a condition expression
 */
export function evaluateCondition(
  expression: string,
  context: ExecutionContext
): boolean {
  try {
    // Build context for evaluation
    const evalContext: Record<string, unknown> = {}
    
    for (const [key, value] of context.getContext().variables) {
      evalContext[key] = value
    }
    
    for (const [key, value] of context.getContext().outputs) {
      evalContext[key] = value
    }

    // Use Function constructor for safe-ish evaluation
    const fn = new Function(...Object.keys(evalContext), `return (${expression})`)
    const result = fn(...Object.values(evalContext))
    
    return Boolean(result)
  } catch (e) {
    console.error('Condition evaluation failed:', e)
    return false
  }
}

/**
 * Create a tool call
 */
export function createToolCall(
  tool: ToolName,
  params: Record<string, unknown>,
  callerAgentId: string
): ToolCall {
  return {
    id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tool,
    params,
    callerAgentId
  }
}
