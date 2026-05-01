import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowExecutionResult,
  NodeType,
  ToolResult
} from '../types/workflow'
import type { AiNode } from '../types/workbench'
import { ParsedWorkflow, parseWorkflow, getNodesAtLevel } from './dag-parser'
import { ExecutionContext, renderTemplate, evaluateCondition } from './execution-context'
import type { WorkflowContext } from '../types/workflow'
import { openBrowser, sendToBrowser, readFromBrowser, sendChatRequest } from '../services/api'
import { toProviderConfig } from '../utils/workbench'

/**
 * Workflow Engine - Executes parsed workflows
 */

export type NodeExecutor = (node: WorkflowNode, context: ExecutionContext) => Promise<unknown>

export interface WorkflowEngineConfig {
  executors: Partial<Record<NodeType, NodeExecutor>>
  aiNodes?: AiNode[]
  variables?: Record<string, string>
  onNodeStart?: (nodeId: string, node: WorkflowNode) => void
  onNodeComplete?: (nodeId: string, result: unknown) => void
  onNodeError?: (nodeId: string, error: string) => void
  onProgress?: (context: WorkflowContext) => void
}

export class WorkflowEngine {
  private config: WorkflowEngineConfig

  constructor(config: WorkflowEngineConfig) {
    this.config = config
  }

  /**
   * Execute a workflow
   */
  async execute(definition: WorkflowDefinition): Promise<WorkflowExecutionResult> {
    const parsed = parseWorkflow(definition)
    const context = new ExecutionContext()
    
    // Set initial variables if provided
    if (this.config.variables) {
      for (const [key, value] of Object.entries(this.config.variables)) {
        context.setVariable(key, value)
      }
    }
    
    if (this.config.onProgress) {
      context.setUpdateCallback(this.config.onProgress)
    }

    try {
      // Execute by levels (parallel where possible)
      const maxLevel = Math.max(...parsed.levels.values())

      for (let level = 0; level <= maxLevel; level++) {
        const nodeIds = getNodesAtLevel(parsed, level)
        
        // Execute all nodes at this level in parallel
        const promises = nodeIds.map(async (nodeId) => {
          const node = parsed.definition.nodes.find(n => n.id === nodeId)!
          return this.executeNode(node, parsed, context)
        })

        await Promise.all(promises)

        // Check if any node failed
        if (context.hasErrors()) {
          context.finish()
          return {
            success: false,
            context: context.getContext(),
            error: 'Workflow execution failed'
          }
        }
      }

      // Get final output from last node or entry point
      const lastNodeId = parsed.executionOrder[parsed.executionOrder.length - 1]
      const finalOutput = context.getNodeOutput(lastNodeId)

      context.finish(finalOutput)

      return {
        success: true,
        context: context.getContext(),
        finalOutput
      }

    } catch (error) {
      context.finish()
      return {
        success: false,
        context: context.getContext(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: WorkflowNode,
    parsed: ParsedWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    // Check dependencies
    for (const depId of node.dependsOn || []) {
      const depStatus = context.getNodeStatus(depId)
      if (depStatus === 'failed') {
        context.setNodeStatus(node.id, 'skipped')
        return
      }
    }

    // Mark as running
    context.setNodeStatus(node.id, 'running')
    this.config.onNodeStart?.(node.id, node)

    try {
      // Render template variables in prompt
      const renderedNode = this.renderNodeTemplates(node, context)

      // Get executor for this node type
      const executor = this.config.executors[renderedNode.type]
      if (!executor) {
        throw new Error(`No executor for node type: ${renderedNode.type}`)
      }

      // Execute
      const result = await executor(renderedNode, context)

      // Store output
      context.setNodeOutput(node.id, result)
      context.setNodeStatus(node.id, 'completed')
      this.config.onNodeComplete?.(node.id, result)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      context.setNodeError(node.id, errorMsg)
      this.config.onNodeError?.(node.id, errorMsg)
    }
  }

  /**
   * Render template variables in node configuration
   */
  private renderNodeTemplates(node: WorkflowNode, context: ExecutionContext): WorkflowNode {
    const rendered = { ...node }

    if (node.prompt) {
      rendered.prompt = renderTemplate(node.prompt, context)
    }

    if (node.agent?.role) {
      rendered.agent = {
        ...node.agent,
        role: renderTemplate(node.agent.role, context)
      }
    }

    return rendered
  }
}

/**
 * Create default executors that use IPC to communicate with main process
 */
export function createDefaultExecutors(aiNodes: AiNode[] = []): Partial<Record<NodeType, NodeExecutor>> {
  const api = window.aiWorkbench

  return {
    // Prompt nodes - just return the prompt text
    prompt: async (node, context) => {
      return node.prompt || ''
    },

    // Agent nodes - send prompt to webview via IPC
    agent: async (node, context) => {
      if (!node.prompt) {
        throw new Error('Agent node missing prompt')
      }

      const aiNode = resolveAiNode(node, aiNodes)
      if (aiNode?.kind === 'api') {
        const result = await sendChatRequest(toProviderConfig(aiNode), node.prompt, {
          conversationKey: aiNode.conversationKey || aiNode.id,
        })
        if (result.error) {
          throw new Error(result.error)
        }
        return result.content
      }

      const provider = aiNode?.provider || node.agent?.provider || 'chatgpt'
      const slotId = await resolveAgentSessionId(
        aiNode?.sessionId || node.agent?.slotId,
        provider,
        aiNode?.webUrl,
        aiNode?.name || provider,
        aiNode?.accountLabel,
        aiNode?.accountKey,
      )

      const result = await sendToBrowser(slotId, node.prompt)

      if (result.error) {
        throw new Error(result.error)
      }

      await waitForBrowserResponse(slotId, 5000)

      const response = await readFromBrowser(slotId)

      if (response.error) {
        throw new Error(response.error)
      }

      return response.content
    },

    // Tool nodes - execute tool via IPC
    tool: async (node, context) => {
      if (!node.tool) {
        throw new Error('Tool node missing tool configuration')
      }

      const { name, params } = node.tool
      let result: ToolResult

      // Render template variables in params
      const renderedParams: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string') {
          renderedParams[key] = renderTemplate(value, context)
        } else {
          renderedParams[key] = value
        }
      }

      switch (name) {
        case 'fsRead':
          result = await api.fsRead(String(renderedParams.filePath))
          break
        case 'fsWrite':
          result = await api.fsWrite(
            String(renderedParams.filePath),
            String(renderedParams.content)
          )
          break
        case 'fsList':
          result = await api.fsList(String(renderedParams.dirPath))
          break
        case 'shell':
          result = await api.shell(String(renderedParams.command))
          break
        case 'clipboardRead':
          result = await api.clipboardRead()
          break
        case 'clipboardWrite':
          result = await api.clipboardWrite(String(renderedParams.text))
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      if (!result.success) {
        throw new Error(result.error || 'Tool execution failed')
      }

      return result.data
    },

    // Condition nodes - evaluate and route
    condition: async (node, context) => {
      if (!node.condition) {
        throw new Error('Condition node missing condition configuration')
      }

      const condition = node.condition
      const evaluated = evaluateCondition(condition.expression, context)

      return {
        evaluated,
        branch: evaluated ? condition.trueBranch : condition.falseBranch
      }
    },

    // Merge nodes - combine outputs from multiple branches
    merge: async (node, context) => {
      // Get outputs from all dependencies
      const outputs: Record<string, unknown> = {}
      
      for (const depId of node.dependsOn || []) {
        outputs[depId] = context.getNodeOutput(depId)
      }

      return outputs
    }
  }
}

async function resolveAgentSessionId(
  slotId: string | undefined,
  provider: string,
  url?: string,
  providerName?: string,
  accountLabel?: string,
  accountKey?: string,
): Promise<string> {
  if (slotId) {
    return slotId
  }

  const providerUrl = url || DEFAULT_PROVIDER_URLS[provider] || DEFAULT_PROVIDER_URLS.chatgpt
  const result = await openBrowser(provider, providerUrl, {
    providerName: providerName || provider,
    accountLabel,
    accountKey,
  })

  if (result.error || !result.sessionId) {
    throw new Error(result.error || `Failed to open browser session for ${provider}`)
  }

  return result.sessionId
}

async function waitForBrowserResponse(sessionId: string, timeoutMs: number): Promise<void> {
  void sessionId
  await new Promise(resolve => setTimeout(resolve, timeoutMs))
}

function resolveAiNode(node: WorkflowNode, aiNodes: AiNode[] = []): AiNode | undefined {
  const nodeId = node.aiNodeId || node.agent?.aiNodeId || node.agent?.slotId
  if (!nodeId) return undefined
  return aiNodes.find(aiNode => aiNode.id === nodeId)
}

const DEFAULT_PROVIDER_URLS: Record<string, string> = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  claude: 'https://claude.ai/new',
  grok: 'https://grok.com/',
}

/**
 * Execute a workflow with default executors
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  callbacks?: Omit<WorkflowEngineConfig, 'executors'>
): Promise<WorkflowExecutionResult> {
  const engine = new WorkflowEngine({
    executors: createDefaultExecutors(callbacks?.aiNodes ?? []),
    ...callbacks
  })

  return engine.execute(definition)
}
