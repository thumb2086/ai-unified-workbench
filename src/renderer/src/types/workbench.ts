export type Language = 'zh' | 'en'
export type AiNodeKind = 'web' | 'api'
export type AiProvider = 'chatgpt' | 'gemini' | 'claude' | 'grok' | string
export type BlueprintNodeType = 'prompt' | 'agent' | 'tool' | 'condition' | 'merge'
export type ChatMode = 'broadcast' | 'relay' | 'debate'

export interface AiNode {
  id: string
  name: string
  kind: AiNodeKind
  provider: AiProvider
  enabled: boolean
  description?: string
  webUrl?: string
  sessionId?: string
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
  const now = new Date().toISOString()
  return [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      kind: 'web',
      provider: 'chatgpt',
      enabled: true,
      webUrl: 'https://chatgpt.com/',
      sessionId: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini',
      name: 'Gemini',
      kind: 'web',
      provider: 'gemini',
      enabled: true,
      webUrl: 'https://gemini.google.com/app',
      sessionId: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'claude',
      name: 'Claude API',
      kind: 'api',
      provider: 'claude',
      enabled: true,
      apiFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-latest',
      conversationKey: 'claude',
      createdAt: now,
      updatedAt: now,
    },
  ]
}

export function createDefaultWorkflows(): WorkflowBlueprint[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'simple-prompt-chain',
      name: 'Simple Prompt Chain',
      description: 'A simple prompt to agent chain',
      version: '1.0',
      entryPoint: 'prompt-1',
      updatedAt: now,
      nodes: [
        {
          id: 'prompt-1',
          type: 'prompt',
          title: 'Prompt',
          prompt: 'Write a short story about AI',
          dependsOn: [],
          outputVar: 'story',
          position: { x: 80, y: 120 },
        },
        {
          id: 'agent-1',
          type: 'agent',
          title: 'Agent',
          aiNodeId: 'chatgpt',
          prompt: 'Summarize this story: {{story}}',
          dependsOn: ['prompt-1'],
          outputVar: 'summary',
          position: { x: 360, y: 120 },
        },
      ],
    },
    {
      id: 'multi-agent-debate',
      name: 'Multi-Agent Debate',
      description: 'A debate between multiple AI nodes',
      version: '1.0',
      entryPoint: 'topic',
      updatedAt: now,
      nodes: [
        {
          id: 'topic',
          type: 'prompt',
          title: 'Topic',
          prompt: 'What are the ethical implications of AI?',
          dependsOn: [],
          outputVar: 'topic',
          position: { x: 80, y: 120 },
        },
        {
          id: 'proponent',
          type: 'agent',
          title: 'Proponent',
          aiNodeId: 'gemini',
          prompt: 'Argue FOR this topic: {{topic}}',
          dependsOn: ['topic'],
          outputVar: 'gemini_argument',
          position: { x: 360, y: 40 },
        },
        {
          id: 'opponent',
          type: 'agent',
          title: 'Opponent',
          aiNodeId: 'chatgpt',
          prompt: 'Argue AGAINST this topic: {{topic}}',
          dependsOn: ['topic'],
          outputVar: 'chatgpt_argument',
          position: { x: 360, y: 200 },
        },
      ],
    },
  ]
}

export function createEmptyWorkflow(): WorkflowBlueprint {
  const now = new Date().toISOString()
  return {
    id: `workflow-${Date.now()}`,
    name: 'Untitled Workflow',
    description: '',
    version: '1.0',
    entryPoint: '',
    updatedAt: now,
    nodes: [],
  }
}

export function createEmptyAiNode(kind: AiNodeKind = 'web'): AiNode {
  const now = new Date().toISOString()
  const id = `ai-${Date.now()}`
  return {
    id,
    name: kind === 'web' ? 'New Web AI' : 'New API AI',
    kind,
    provider: kind === 'web' ? 'chatgpt' : 'openai',
    enabled: true,
    webUrl: kind === 'web' ? 'https://chatgpt.com/' : undefined,
    apiFormat: kind === 'api' ? 'openai' : undefined,
    baseUrl: kind === 'api' ? 'https://api.openai.com/v1' : undefined,
    model: kind === 'api' ? 'gpt-4o' : undefined,
    conversationKey: kind === 'api' ? id : undefined,
    createdAt: now,
    updatedAt: now,
  }
}
