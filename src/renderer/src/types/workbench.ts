export type Language = 'zh' | 'en'
export type AiNodeKind = 'web' | 'api'
export type AiProvider = 'chatgpt' | 'gemini' | 'claude' | 'grok' | string
export type BlueprintNodeType = 'prompt' | 'agent' | 'tool' | 'condition' | 'merge' | 'output'
export type ChatMode = 'broadcast' | 'relay' | 'debate' | 'subagent'

export interface AiNode {
  id: string
  name: string
  kind: AiNodeKind
  provider: AiProvider
  enabled: boolean
  description?: string
  webUrl?: string
  sessionId?: string
  accountLabel?: string
  accountKey?: string
  conversationKey?: string
  apiFormat?: 'openai' | 'nvidia-nim' | 'anthropic' | 'custom'
  baseUrl?: string
  apiKey?: string
  model?: string
  headers?: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface BlueprintPosition {
  x: number
  y: number
}

export interface BlueprintNode {
  id: string
  type: BlueprintNodeType
  title: string
  description?: string
  aiNodeId?: string
  agent?: {
    provider?: AiProvider
  }
  prompt?: string
  dependsOn: string[]
  outputVar?: string
  position: BlueprintPosition
  tool?: {
    name: 'fsRead' | 'fsWrite' | 'fsList' | 'shell' | 'clipboardRead' | 'clipboardWrite'
    params: Record<string, unknown>
  }
  condition?: {
    expression: string
    trueBranch: string
    falseBranch: string
  }
}

export interface WorkflowBlueprint {
  id: string
  name: string
  description?: string
  version: string
  entryPoint: string
  nodes: BlueprintNode[]
  updatedAt: string
}

export interface ChatMessage {
  id: string
  providerId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatThread {
  id: string
  selection: {
    providerIds: string[]
    mode: ChatMode
    workflowId?: string
  }
  prompt: string
  topic?: string
  messages: ChatMessage[]
  updatedAt: string
}

export interface WorkbenchState {
  aiNodes: AiNode[]
  workflows: WorkflowBlueprint[]
  chatThreads: ChatThread[]
  language: Language
  activeWorkflowId: string | null
  activeChatThreadId: string | null
  activeAiNodeId: string | null
}

export function createDefaultAiNodes(): AiNode[] {
  return []
}

export function createDefaultWorkflows(): WorkflowBlueprint[] {
  const now = new Date().toISOString()
  return [
    createSimplePromptChain(now),
    createBroadcastWorkflow(now),
    createRelayWorkflow(now),
    createDebateWorkflow(now),
    createSubagentWorkflow(now),
  ]
}

export function mergeBuiltinWorkflows(workflows: WorkflowBlueprint[]): WorkflowBlueprint[] {
  const builtin = createDefaultWorkflows()
  const storedById = new Map(workflows.map(workflow => [workflow.id, workflow]))
  const mergedBuiltin = builtin.map(workflow => {
    const stored = storedById.get(workflow.id)
    return stored ? ensureWorkflowHasOutput(stored) : workflow
  })
  const custom = workflows.filter(workflow => !BUILTIN_WORKFLOW_IDS.has(workflow.id))
  return [...mergedBuiltin, ...custom]
}

function ensureWorkflowHasOutput(workflow: WorkflowBlueprint): WorkflowBlueprint {
  if (workflow.nodes.some(node => node.type === 'output')) return workflow
  if (workflow.nodes.length === 0) return workflow

  const dependencyIds = new Set(workflow.nodes.flatMap(node => node.dependsOn))
  const terminalNodes = workflow.nodes.filter(node => !dependencyIds.has(node.id))
  const dependsOn = terminalNodes.length > 0
    ? terminalNodes.map(node => node.id)
    : [workflow.nodes[workflow.nodes.length - 1].id]
  const maxX = Math.max(...workflow.nodes.map(node => node.position.x))
  const avgY = Math.round(
    dependsOn
      .map(id => workflow.nodes.find(node => node.id === id)?.position.y ?? 160)
      .reduce((sum, y) => sum + y, 0) / dependsOn.length,
  )

  return {
    ...workflow,
    nodes: [
      ...workflow.nodes,
      {
        id: `${workflow.id}-output`,
        type: 'output',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u5de5\u4f5c\u6d41\u7684\u7d50\u679c\u51fa\u53e3\u3002',
        dependsOn,
        outputVar: 'final_output',
        position: { x: maxX + 360, y: avgY },
      },
    ],
  }
}

function createSimplePromptChain(now: string): WorkflowBlueprint {
  return {
    id: 'prompt-chain',
    name: '\u7c21\u55ae\u63d0\u793a\u93c8',
    description: '\u5148\u7528 prompt \u6574\u7406\u5167\u5bb9\uff0c\u518d\u4ea4\u7d66 AI \u7bc0\u9ede\u8655\u7406\u3002',
    version: '1.0',
    entryPoint: 'prompt-1',
    updatedAt: now,
    nodes: [
      {
        id: 'prompt-1',
        type: 'prompt',
        title: '\u63d0\u793a\u8a5e',
        prompt: 'Write a short story about AI.',
        dependsOn: [],
        outputVar: 'story',
        position: { x: 120, y: 180 },
      },
      {
        id: 'agent-1',
        type: 'agent',
        title: '\u4ee3\u7406\u4eba',
        agent: { provider: 'chatgpt' },
        prompt: 'Summarize this story: {{story}}',
        dependsOn: ['prompt-1'],
        outputVar: 'summary',
        position: { x: 460, y: 180 },
      },
      {
        id: 'prompt-chain-output',
        type: 'output',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u8f38\u51fa\u6458\u8981\u7d50\u679c\u3002',
        dependsOn: ['agent-1'],
        outputVar: 'final_output',
        position: { x: 820, y: 180 },
      },
    ],
  }
}

function createBroadcastWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'broadcast-workflow',
    name: '\u5ee3\u64ad\u5de5\u4f5c\u6d41',
    description: '\u540c\u4e00\u500b\u4e3b\u984c\u540c\u6642\u9001\u7d66\u591a\u500b AI \u7bc0\u9ede\u3002',
    version: '1.0',
    entryPoint: 'broadcast-topic',
    updatedAt: now,
    nodes: [
      {
        id: 'broadcast-topic',
        type: 'prompt',
        title: '\u5ee3\u64ad\u4e3b\u984c',
        prompt: 'Analyze the topic from multiple perspectives: {{topic}}',
        dependsOn: [],
        outputVar: 'topic',
        position: { x: 120, y: 220 },
      },
      {
        id: 'broadcast-chatgpt',
        type: 'agent',
        title: 'ChatGPT',
        agent: { provider: 'chatgpt' },
        prompt: 'Provide the first perspective for: {{topic}}',
        dependsOn: ['broadcast-topic'],
        outputVar: 'chatgpt_result',
        position: { x: 460, y: 80 },
      },
      {
        id: 'broadcast-gemini',
        type: 'agent',
        title: 'Gemini',
        agent: { provider: 'gemini' },
        prompt: 'Provide the second perspective for: {{topic}}',
        dependsOn: ['broadcast-topic'],
        outputVar: 'gemini_result',
        position: { x: 460, y: 220 },
      },
      {
        id: 'broadcast-claude',
        type: 'agent',
        title: 'Claude',
        agent: { provider: 'claude' },
        prompt: 'Provide the third perspective for: {{topic}}',
        dependsOn: ['broadcast-topic'],
        outputVar: 'claude_result',
        position: { x: 460, y: 360 },
      },
      {
        id: 'broadcast-merge',
        type: 'merge',
        title: '\u5f59\u6574',
        description: '\u628a\u591a\u500b AI \u7684\u56de\u8986\u5408\u4f75\u3002',
        dependsOn: ['broadcast-chatgpt', 'broadcast-gemini', 'broadcast-claude'],
        outputVar: 'broadcast_summary',
        position: { x: 820, y: 220 },
      },
      {
        id: 'broadcast-output',
        type: 'output',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u5448\u73fe\u5ee3\u64ad\u5f8c\u7684\u7d71\u6574\u7d50\u679c\u3002',
        dependsOn: ['broadcast-merge'],
        outputVar: 'final_output',
        position: { x: 1180, y: 220 },
      },
    ],
  }
}

function createRelayWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'relay-workflow',
    name: '\u63a5\u529b\u5de5\u4f5c\u6d41',
    description: '\u4e0a\u4e00\u500b\u7bc0\u9ede\u7684\u8f38\u51fa\uff0c\u6703\u6210\u70ba\u4e0b\u4e00\u500b\u7bc0\u9ede\u7684\u8f38\u5165\u3002',
    version: '1.0',
    entryPoint: 'relay-topic',
    updatedAt: now,
    nodes: [
      {
        id: 'relay-topic',
        type: 'prompt',
        title: '\u8d77\u59cb\u984c\u76ee',
        prompt: 'Create the initial outline: {{seed}}',
        dependsOn: [],
        outputVar: 'seed',
        position: { x: 120, y: 220 },
      },
      {
        id: 'relay-1',
        type: 'agent',
        title: '\u7b2c\u4e00\u68d2',
        agent: { provider: 'chatgpt' },
        prompt: 'Expand the initial outline: {{seed}}',
        dependsOn: ['relay-topic'],
        outputVar: 'step_one',
        position: { x: 420, y: 140 },
      },
      {
        id: 'relay-2',
        type: 'agent',
        title: '\u7b2c\u4e8c\u68d2',
        agent: { provider: 'gemini' },
        prompt: 'Refine the expanded outline: {{step_one}}',
        dependsOn: ['relay-1'],
        outputVar: 'step_two',
        position: { x: 740, y: 220 },
      },
      {
        id: 'relay-3',
        type: 'agent',
        title: '\u7b2c\u4e09\u68d2',
        agent: { provider: 'claude' },
        prompt: 'Turn the refined outline into a final answer: {{step_two}}',
        dependsOn: ['relay-2'],
        outputVar: 'relay_result',
        position: { x: 1060, y: 300 },
      },
      {
        id: 'relay-output',
        type: 'output',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u63a5\u529b\u5b8c\u6210\u5f8c\u7684\u6700\u7d42\u7d50\u679c\u3002',
        dependsOn: ['relay-3'],
        outputVar: 'final_output',
        position: { x: 1420, y: 300 },
      },
    ],
  }
}

function createDebateWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'debate-workflow',
    name: '\u8faf\u8ad6\u5de5\u4f5c\u6d41',
    description: '\u6b63\u53cd\u96d9\u65b9\u5404\u81ea\u56de\u61c9\uff0c\u6700\u5f8c\u518d\u5408\u4f75\u7d50\u679c\u3002',
    version: '1.0',
    entryPoint: 'debate-topic',
    updatedAt: now,
    nodes: [
      {
        id: 'debate-topic',
        type: 'prompt',
        title: '\u8faf\u8ad6\u4e3b\u984c',
        prompt: 'Debate the topic: {{topic}}',
        dependsOn: [],
        outputVar: 'topic',
        position: { x: 120, y: 220 },
      },
      {
        id: 'debate-pro',
        type: 'agent',
        title: '\u6b63\u65b9',
        agent: { provider: 'chatgpt' },
        prompt: 'Argue for the topic: {{topic}}',
        dependsOn: ['debate-topic'],
        outputVar: 'pro_argument',
        position: { x: 460, y: 120 },
      },
      {
        id: 'debate-con',
        type: 'agent',
        title: '\u53cd\u65b9',
        agent: { provider: 'gemini' },
        prompt: 'Argue against the topic: {{topic}}',
        dependsOn: ['debate-topic'],
        outputVar: 'con_argument',
        position: { x: 460, y: 320 },
      },
      {
        id: 'debate-merge',
        type: 'merge',
        title: '\u8faf\u8ad6\u7d50\u8ad6',
        description: '\u6574\u5408\u6b63\u53cd\u65b9\u7684\u91cd\u9ede\u8ad6\u9ede\u3002',
        dependsOn: ['debate-pro', 'debate-con'],
        outputVar: 'debate_summary',
        position: { x: 820, y: 220 },
      },
      {
        id: 'debate-output',
        type: 'output',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u8f38\u51fa\u8faf\u8ad6\u5f8c\u7684\u7d50\u8ad6\u3002',
        dependsOn: ['debate-merge'],
        outputVar: 'final_output',
        position: { x: 1180, y: 220 },
      },
    ],
  }
}

function createSubagentWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'subagent-workflow',
    name: '\u5b50\u4ee3\u7406\u5de5\u4f5c\u6d41',
    description: '\u4e3b\u4ee3\u7406\u5148\u898f\u5283\uff0c\u518d\u7531\u5b50\u4ee3\u7406\u88dc\u5145\u7d30\u7bc0\u3002',
    version: '1.0',
    entryPoint: 'subagent-brief',
    updatedAt: now,
    nodes: [
      {
        id: 'subagent-brief',
        type: 'prompt',
        title: '\u4efb\u52d9\u7c21\u5831',
        prompt: 'Prepare the task brief: {{brief}}',
        dependsOn: [],
        outputVar: 'brief',
        position: { x: 120, y: 220 },
      },
      {
        id: 'subagent-master',
        type: 'agent',
        title: '\u4e3b\u4ee3\u7406',
        agent: { provider: 'chatgpt' },
        prompt: 'Plan the work and delegate subtasks: {{brief}}',
        dependsOn: ['subagent-brief'],
        outputVar: 'master_plan',
        position: { x: 460, y: 140 },
      },
      {
        id: 'subagent-worker',
        type: 'agent',
        title: '\u5b50\u4ee3\u7406',
        agent: { provider: 'claude' },
        prompt: 'Complete the detailed execution steps: {{master_plan}}',
        dependsOn: ['subagent-master'],
        outputVar: 'worker_detail',
        position: { x: 820, y: 280 },
      },
      {
        id: 'subagent-merge',
        type: 'merge',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u5408\u4f75\u4e3b\u4ee3\u7406\u8207\u5b50\u4ee3\u7406\u7684\u7d50\u679c\u3002',
        dependsOn: ['subagent-master', 'subagent-worker'],
        outputVar: 'subagent_result',
        position: { x: 1120, y: 220 },
      },
      {
        id: 'subagent-output',
        type: 'output',
        title: '\u6700\u7d42\u8f38\u51fa',
        description: '\u8f38\u51fa\u4e3b\u4ee3\u7406\u8207\u5b50\u4ee3\u7406\u6574\u5408\u5f8c\u7684\u7d50\u679c\u3002',
        dependsOn: ['subagent-merge'],
        outputVar: 'final_output',
        position: { x: 1480, y: 220 },
      },
    ],
  }
}

export function createEmptyWorkflow(): WorkflowBlueprint {
  const now = new Date().toISOString()
  return {
    id: `workflow-${Date.now()}`,
    name: '\u65b0\u5de5\u4f5c\u6d41',
    description: '',
    version: '1.0',
    entryPoint: '',
    nodes: [],
    updatedAt: now,
  }
}

export function createEmptyAiNode(kind: AiNodeKind = 'web'): AiNode {
  const now = new Date().toISOString()
  const id = `ai-${Date.now()}`
  return {
    id,
    name: kind === 'web' ? '\u65b0\u7684 Web \u7bc0\u9ede' : '\u65b0\u7684 API \u7bc0\u9ede',
    kind,
    provider: kind === 'web' ? 'chatgpt' : 'openai',
    enabled: true,
    accountLabel: kind === 'web' ? '' : undefined,
    accountKey: kind === 'web' ? '' : undefined,
    apiFormat: kind === 'api' ? 'openai' : undefined,
    baseUrl: kind === 'api' ? 'https://api.openai.com/v1' : undefined,
    model: kind === 'api' ? 'gpt-4o' : undefined,
    conversationKey: kind === 'api' ? id : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

const BUILTIN_WORKFLOW_IDS = new Set([
  'prompt-chain',
  'broadcast-workflow',
  'relay-workflow',
  'debate-workflow',
  'subagent-workflow',
])
