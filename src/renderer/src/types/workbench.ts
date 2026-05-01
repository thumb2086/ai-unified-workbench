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

function createSimplePromptChain(now: string): WorkflowBlueprint {
  return {
    id: 'prompt-chain',
    name: '簡單提示鏈',
    description: '把一段提示詞整理後，再交給代理人摘要。',
    version: '1.0',
    entryPoint: 'prompt-1',
    updatedAt: now,
    nodes: [
      {
        id: 'prompt-1',
        type: 'prompt',
        title: '提示詞',
        prompt: '請先閱讀下列內容，並整理成簡短重點：{{input_text}}',
        dependsOn: [],
        outputVar: 'input_text',
        position: { x: 80, y: 120 },
      },
      {
        id: 'agent-1',
        type: 'agent',
        title: '代理人',
        agent: { provider: 'chatgpt' },
        prompt: '請根據整理後的內容產生摘要：{{input_text}}',
        dependsOn: ['prompt-1'],
        outputVar: 'summary',
        position: { x: 360, y: 120 },
      },
    ],
  }
}

function createBroadcastWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'broadcast-workflow',
    name: '廣播工作流',
    description: '同一個主題同時送給多個 AI，收集不同角度的回應。',
    version: '1.0',
    entryPoint: 'broadcast-topic',
    updatedAt: now,
    nodes: [
      {
        id: 'broadcast-topic',
        type: 'prompt',
        title: '廣播主題',
        prompt: '請針對這個主題產生可廣播給多個 AI 的說明：{{topic}}',
        dependsOn: [],
        outputVar: 'topic',
        position: { x: 80, y: 140 },
      },
      {
        id: 'broadcast-chatgpt',
        type: 'agent',
        title: 'ChatGPT',
        agent: { provider: 'chatgpt' },
        prompt: '請提供第一個分析角度：{{topic}}',
        dependsOn: ['broadcast-topic'],
        outputVar: 'chatgpt_reply',
        position: { x: 380, y: 40 },
      },
      {
        id: 'broadcast-gemini',
        type: 'agent',
        title: 'Gemini',
        agent: { provider: 'gemini' },
        prompt: '請提供第二個分析角度：{{topic}}',
        dependsOn: ['broadcast-topic'],
        outputVar: 'gemini_reply',
        position: { x: 380, y: 180 },
      },
      {
        id: 'broadcast-claude',
        type: 'agent',
        title: 'Claude',
        agent: { provider: 'claude' },
        prompt: '請提供第三個分析角度：{{topic}}',
        dependsOn: ['broadcast-topic'],
        outputVar: 'claude_reply',
        position: { x: 380, y: 320 },
      },
      {
        id: 'broadcast-merge',
        type: 'merge',
        title: '廣播彙整',
        description: '把三個回應合併成最後摘要。',
        dependsOn: ['broadcast-chatgpt', 'broadcast-gemini', 'broadcast-claude'],
        outputVar: 'broadcast_summary',
        position: { x: 700, y: 180 },
      },
    ],
  }
}

function createRelayWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'relay-workflow',
    name: '接力工作流',
    description: '讓上一個節點的輸出成為下一個節點的輸入。',
    version: '1.0',
    entryPoint: 'relay-topic',
    updatedAt: now,
    nodes: [
      {
        id: 'relay-topic',
        type: 'prompt',
        title: '起始題目',
        prompt: '請先整理這個任務重點：{{seed}}',
        dependsOn: [],
        outputVar: 'seed',
        position: { x: 80, y: 140 },
      },
      {
        id: 'relay-1',
        type: 'agent',
        title: '第一棒',
        agent: { provider: 'chatgpt' },
        prompt: '請先整理並延伸：{{seed}}',
        dependsOn: ['relay-topic'],
        outputVar: 'relay_step_1',
        position: { x: 370, y: 60 },
      },
      {
        id: 'relay-2',
        type: 'agent',
        title: '第二棒',
        agent: { provider: 'gemini' },
        prompt: '請承接前一段內容再補充：{{relay_step_1}}',
        dependsOn: ['relay-1'],
        outputVar: 'relay_step_2',
        position: { x: 650, y: 140 },
      },
      {
        id: 'relay-3',
        type: 'agent',
        title: '第三棒',
        agent: { provider: 'claude' },
        prompt: '請把前面兩段整合成完整版本：{{relay_step_2}}',
        dependsOn: ['relay-2'],
        outputVar: 'relay_final',
        position: { x: 930, y: 220 },
      },
    ],
  }
}

function createDebateWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'debate-workflow',
    name: '辯論工作流',
    description: '讓多個 AI 分別提出正反意見，再把結果合併。',
    version: '1.0',
    entryPoint: 'debate-topic',
    updatedAt: now,
    nodes: [
      {
        id: 'debate-topic',
        type: 'prompt',
        title: '辯論主題',
        prompt: '請整理辯論主題與背景：{{topic}}',
        dependsOn: [],
        outputVar: 'topic',
        position: { x: 80, y: 140 },
      },
      {
        id: 'debate-pro',
        type: 'agent',
        title: '正方',
        agent: { provider: 'chatgpt' },
        prompt: '請從支持方角度提出論點：{{topic}}',
        dependsOn: ['debate-topic'],
        outputVar: 'pro_argument',
        position: { x: 380, y: 40 },
      },
      {
        id: 'debate-con',
        type: 'agent',
        title: '反方',
        agent: { provider: 'gemini' },
        prompt: '請從反對方角度提出論點：{{topic}}',
        dependsOn: ['debate-topic'],
        outputVar: 'con_argument',
        position: { x: 380, y: 200 },
      },
      {
        id: 'debate-merge',
        type: 'merge',
        title: '辯論彙整',
        description: '整理正反方的重點差異。',
        dependsOn: ['debate-pro', 'debate-con'],
        outputVar: 'debate_summary',
        position: { x: 700, y: 120 },
      },
    ],
  }
}

function createSubagentWorkflow(now: string): WorkflowBlueprint {
  return {
    id: 'subagent-workflow',
    name: '子代理工作流',
    description: '主代理先規劃，再派子代理補充細節與執行結果。',
    version: '1.0',
    entryPoint: 'subagent-brief',
    updatedAt: now,
    nodes: [
      {
        id: 'subagent-brief',
        type: 'prompt',
        title: '任務簡報',
        prompt: '請先整理任務目標與限制：{{brief}}',
        dependsOn: [],
        outputVar: 'brief',
        position: { x: 80, y: 140 },
      },
      {
        id: 'subagent-master',
        type: 'agent',
        title: '主代理',
        agent: { provider: 'chatgpt' },
        prompt: '請先規劃工作步驟與分派方向：{{brief}}',
        dependsOn: ['subagent-brief'],
        outputVar: 'master_plan',
        position: { x: 380, y: 40 },
      },
      {
        id: 'subagent-worker',
        type: 'agent',
        title: '子代理',
        agent: { provider: 'claude' },
        prompt: '請根據主代理的規劃補充細節與可執行內容：{{master_plan}}',
        dependsOn: ['subagent-master'],
        outputVar: 'subagent_detail',
        position: { x: 660, y: 180 },
      },
      {
        id: 'subagent-merge',
        type: 'merge',
        title: '任務輸出',
        description: '合併主代理與子代理的結果。',
        dependsOn: ['subagent-master', 'subagent-worker'],
        outputVar: 'task_output',
        position: { x: 960, y: 120 },
      },
    ],
  }
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
    name: kind === 'web' ? '新的 Web 節點' : '新的 API 節點',
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
