export type Language = 'zh' | 'en'
export type AiNodeKind = 'web' | 'api'
export type AiProvider = 'chatgpt' | 'gemini' | 'claude' | 'grok' | string
export type BlueprintNodeType = 'prompt' | 'agent' | 'tool' | 'condition' | 'merge'
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
      id: 'prompt-chain',
      name: '提示詞鏈',
      description: '先整理輸入，再交給 AI 代理人處理。',
      version: '1.0',
      entryPoint: 'prompt-1',
      updatedAt: now,
      nodes: [
        {
          id: 'prompt-1',
          type: 'prompt',
          title: '前置提示詞',
          prompt: '請根據以下內容整理重點：{{input_text}}',
          dependsOn: [],
          outputVar: 'input_text',
          position: { x: 80, y: 120 },
        },
        {
          id: 'agent-1',
          type: 'agent',
          title: '代理人',
          prompt: '請摘要這段內容：{{input_text}}',
          dependsOn: ['prompt-1'],
          outputVar: 'summary',
          position: { x: 360, y: 120 },
        },
      ],
    },
    {
      id: 'broadcast-workflow',
      name: '廣播工作流',
      description: '同一個主題同時送給多個 AI 節點。',
      version: '1.0',
      entryPoint: 'topic',
      updatedAt: now,
      nodes: [
        {
          id: 'topic',
          type: 'prompt',
          title: '廣播主題',
          prompt: '請將下列主題同步給所有節點：{{topic}}',
          dependsOn: [],
          outputVar: 'topic',
          position: { x: 80, y: 120 },
        },
        {
          id: 'broadcast-1',
          type: 'agent',
          title: '廣播節點',
          prompt: '請針對主題 {{topic}} 產生回答。',
          dependsOn: ['topic'],
          outputVar: 'broadcast_result',
          position: { x: 360, y: 80 },
        },
      ],
    },
    {
      id: 'relay-workflow',
      name: '接力工作流',
      description: '前一個 AI 的輸出接到下一個 AI。',
      version: '1.0',
      entryPoint: 'relay-1',
      updatedAt: now,
      nodes: [
        {
          id: 'relay-1',
          type: 'prompt',
          title: '起始提示',
          prompt: '請先整理這段內容：{{seed}}',
          dependsOn: [],
          outputVar: 'seed',
          position: { x: 80, y: 120 },
        },
        {
          id: 'relay-2',
          type: 'agent',
          title: '接力代理',
          prompt: '請接續前文並進一步整理：{{seed}}',
          dependsOn: ['relay-1'],
          outputVar: 'relay_output',
          position: { x: 360, y: 120 },
        },
      ],
    },
    {
      id: 'debate-workflow',
      name: '辯論工作流',
      description: '讓多個 AI 針對同一主題進行辯論。',
      version: '1.0',
      entryPoint: 'debate-topic',
      updatedAt: now,
      nodes: [
        {
          id: 'debate-topic',
          type: 'prompt',
          title: '辯論主題',
          prompt: '請針對下列主題進行辯論：{{topic}}',
          dependsOn: [],
          outputVar: 'topic',
          position: { x: 80, y: 120 },
        },
        {
          id: 'pro',
          type: 'agent',
          title: '正方',
          prompt: '請提出支持 {{topic}} 的論點。',
          dependsOn: ['debate-topic'],
          outputVar: 'pro_argument',
          position: { x: 360, y: 40 },
        },
        {
          id: 'con',
          type: 'agent',
          title: '反方',
          prompt: '請提出反對 {{topic}} 的論點。',
          dependsOn: ['debate-topic'],
          outputVar: 'con_argument',
          position: { x: 360, y: 200 },
        },
      ],
    },
    {
      id: 'subagent-workflow',
      name: '子代理工作流',
      description: '主代理先規劃，再派子代理補充細節。',
      version: '1.0',
      entryPoint: 'master-brief',
      updatedAt: now,
      nodes: [
        {
          id: 'master-brief',
          type: 'prompt',
          title: '任務簡述',
          prompt: '請先整理任務目標與限制條件：{{brief}}',
          dependsOn: [],
          outputVar: 'brief',
          position: { x: 80, y: 120 },
        },
        {
          id: 'master-agent',
          type: 'agent',
          title: '主代理',
          prompt: '請根據任務簡述規劃第一版方案：{{brief}}',
          dependsOn: ['master-brief'],
          outputVar: 'master_plan',
          position: { x: 360, y: 120 },
        },
      ],
    },
  ]
}

export function createEmptyWorkflow(): WorkflowBlueprint {
  const now = new Date().toISOString()
  return {
    id: `workflow-${Date.now()}`,
    name: '新工作流',
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
    name: kind === 'web' ? '新 Web 節點' : '新 API 節點',
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
