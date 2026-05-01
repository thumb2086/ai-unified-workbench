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
  return []
}

export function createDefaultWorkflows(): WorkflowBlueprint[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'simple-prompt-chain',
      name: '簡單提示鏈',
      description: '簡單的提示詞到代理人流程',
      version: '1.0',
      entryPoint: 'prompt-1',
      updatedAt: now,
      nodes: [
        {
          id: 'prompt-1',
          type: 'prompt',
          title: '提示詞',
          prompt: '請寫一個關於 AI 的短篇故事',
          dependsOn: [],
          outputVar: 'story',
          position: { x: 80, y: 120 },
        },
        {
          id: 'agent-1',
          type: 'agent',
          title: '代理人',
          prompt: '請總結這個故事：{{story}}',
          dependsOn: ['prompt-1'],
          outputVar: 'summary',
          position: { x: 360, y: 120 },
        },
      ],
    },
    {
      id: 'multi-agent-debate',
      name: '多代理人辯論',
      description: '多個 AI 節點進行辯論',
      version: '1.0',
      entryPoint: 'topic',
      updatedAt: now,
      nodes: [
        {
          id: 'topic',
          type: 'prompt',
          title: '主題',
          prompt: 'AI 的倫理影響是什麼？',
          dependsOn: [],
          outputVar: 'topic',
          position: { x: 80, y: 120 },
        },
        {
          id: 'proponent',
          type: 'agent',
          title: '正方',
          prompt: '請支持這個主題：{{topic}}',
          dependsOn: ['topic'],
          outputVar: 'gemini_argument',
          position: { x: 360, y: 40 },
        },
        {
          id: 'opponent',
          type: 'agent',
          title: '反方',
          prompt: '請反對這個主題：{{topic}}',
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
    name: '未命名工作流',
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
    name: kind === 'web' ? '新的 Web 節點' : '新的 API 節點',
    kind,
    provider: kind === 'web' ? 'chatgpt' : 'openai',
    enabled: true,
    apiFormat: kind === 'api' ? 'openai' : undefined,
    baseUrl: kind === 'api' ? 'https://api.openai.com/v1' : undefined,
    model: kind === 'api' ? 'gpt-4o' : undefined,
    conversationKey: kind === 'api' ? id : undefined,
    createdAt: now,
    updatedAt: now,
  }
}
