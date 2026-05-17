export type Language = 'zh' | 'en'
export type AiNodeKind = 'web' | 'api'
export type AiProvider = 'chatgpt' | 'gemini' | 'claude' | 'grok' | string
export type BlueprintNodeType = 'prompt' | 'agent' | 'tool' | 'condition' | 'merge' | 'output'
export type ChatMode = 'broadcast' | 'relay' | 'debate' | 'subagent'
export type BlueprintEditorMode = 'form' | 'legacy'
export type BlueprintTemplateId = 'prompt-chain' | 'broadcast' | 'relay' | 'debate' | 'subagent' | 'custom'

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

export interface BlueprintStep {
  id: string
  type: BlueprintNodeType
  title: string
  description?: string
  prompt?: string
  aiNodeId?: string
  provider?: AiProvider
  dependsOn: string[]
  outputVar?: string
  tool?: BlueprintNode['tool']
  condition?: BlueprintNode['condition']
}

export interface WorkflowBlueprint {
  id: string
  name: string
  description?: string
  version: string
  entryPoint: string
  templateId: BlueprintTemplateId
  editorMode: BlueprintEditorMode
  steps: BlueprintStep[]
  nodes: BlueprintNode[]
  updatedAt: string
  legacySource?: boolean
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
    createWorkflowFromTemplate('prompt-chain', now),
    createWorkflowFromTemplate('broadcast', now),
    createWorkflowFromTemplate('relay', now),
    createWorkflowFromTemplate('debate', now),
    createWorkflowFromTemplate('subagent', now),
  ]
}

export function mergeBuiltinWorkflows(workflows: WorkflowBlueprint[]): WorkflowBlueprint[] {
  const migrated = workflows.map(migrateWorkflowBlueprint)
  const builtin = createDefaultWorkflows()
  const storedById = new Map(migrated.map(workflow => [workflow.id, workflow]))
  const mergedBuiltin = builtin.map(workflow => storedById.get(workflow.id) ?? workflow)
  const custom = migrated.filter(workflow => !BUILTIN_WORKFLOW_IDS.has(workflow.id))
  return [...mergedBuiltin, ...custom]
}

export function migrateWorkflowBlueprint(workflow: WorkflowBlueprint): WorkflowBlueprint {
  if (workflow.steps && workflow.templateId && workflow.editorMode) {
    return {
      ...workflow,
      nodes: buildWorkflowNodesFromSteps(workflow.steps),
      entryPoint: workflow.entryPoint || workflow.steps[0]?.id || workflow.nodes[0]?.id || '',
    }
  }

  const fromNodes = convertNodesToSteps(workflow.nodes || [])
  if (fromNodes.length > 0) {
    const inferredTemplate = inferTemplateId(workflow.id)
    return {
      ...workflow,
      templateId: inferredTemplate,
      editorMode: 'form',
      steps: fromNodes,
      nodes: buildWorkflowNodesFromSteps(fromNodes),
      entryPoint: workflow.entryPoint || fromNodes[0]?.id || '',
    }
  }

  return {
    ...workflow,
    templateId: 'custom',
    editorMode: 'legacy',
    steps: [],
    nodes: workflow.nodes || [],
    legacySource: true,
  }
}

export function buildWorkflowNodesFromSteps(steps: BlueprintStep[]): BlueprintNode[] {
  const positions = buildAutoLayout(steps)
  return steps.map(step => ({
    id: step.id,
    type: step.type,
    title: step.title,
    description: step.description,
    aiNodeId: step.aiNodeId,
    agent: step.type === 'agent'
      ? {
          provider: step.provider,
        }
      : undefined,
    prompt: step.prompt,
    dependsOn: [...step.dependsOn],
    outputVar: step.outputVar,
    position: positions.get(step.id) || { x: 120, y: 160 },
    tool: step.tool,
    condition: step.condition,
  }))
}

export function createWorkflowFromTemplate(templateId: Exclude<BlueprintTemplateId, 'custom'>, now = new Date().toISOString()): WorkflowBlueprint {
  const base = TEMPLATE_METADATA[templateId]
  const steps = createTemplateSteps(templateId)
  return {
    id: base.id,
    name: base.name,
    description: base.description,
    version: '1.0',
    entryPoint: steps[0]?.id || '',
    templateId,
    editorMode: 'form',
    steps,
    nodes: buildWorkflowNodesFromSteps(steps),
    updatedAt: now,
  }
}

export function createEmptyWorkflow(): WorkflowBlueprint {
  const now = new Date().toISOString()
  const seed = Date.now()
  const steps: BlueprintStep[] = [
    {
      id: `prompt-${seed}`,
      type: 'prompt',
      title: 'Start Prompt',
      prompt: 'Describe the task.',
      dependsOn: [],
      outputVar: 'input',
    },
    {
      id: `output-${seed + 1}`,
      type: 'output',
      title: 'Final Output',
      dependsOn: [`prompt-${seed}`],
      outputVar: 'final_output',
    },
  ]
  return {
    id: `workflow-${Date.now()}`,
    name: 'New Workflow',
    description: '',
    version: '1.0',
    entryPoint: steps[0].id,
    templateId: 'custom',
    editorMode: 'form',
    steps,
    nodes: buildWorkflowNodesFromSteps(steps),
    updatedAt: now,
  }
}

export function createEmptyAiNode(kind: AiNodeKind = 'web'): AiNode {
  const now = new Date().toISOString()
  const id = `ai-${Date.now()}`
  return {
    id,
    name: kind === 'web' ? 'New Web Node' : 'New API Node',
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

function createTemplateSteps(templateId: Exclude<BlueprintTemplateId, 'custom'>): BlueprintStep[] {
  switch (templateId) {
    case 'prompt-chain':
      return [
        { id: 'prompt-1', type: 'prompt', title: 'Prompt', prompt: 'Write a short story about AI.', dependsOn: [], outputVar: 'story' },
        { id: 'agent-1', type: 'agent', title: 'Agent', provider: 'chatgpt', prompt: 'Summarize this story: {{story}}', dependsOn: ['prompt-1'], outputVar: 'summary' },
        { id: 'prompt-chain-output', type: 'output', title: 'Final Output', dependsOn: ['agent-1'], outputVar: 'final_output' },
      ]
    case 'broadcast':
      return [
        { id: 'broadcast-topic', type: 'prompt', title: 'Broadcast Topic', prompt: 'Analyze the topic from multiple perspectives: {{topic}}', dependsOn: [], outputVar: 'topic' },
        { id: 'broadcast-chatgpt', type: 'agent', title: 'ChatGPT', provider: 'chatgpt', prompt: 'Provide the first perspective for: {{topic}}', dependsOn: ['broadcast-topic'], outputVar: 'chatgpt_result' },
        { id: 'broadcast-gemini', type: 'agent', title: 'Gemini', provider: 'gemini', prompt: 'Provide the second perspective for: {{topic}}', dependsOn: ['broadcast-topic'], outputVar: 'gemini_result' },
        { id: 'broadcast-claude', type: 'agent', title: 'Claude', provider: 'claude', prompt: 'Provide the third perspective for: {{topic}}', dependsOn: ['broadcast-topic'], outputVar: 'claude_result' },
        { id: 'broadcast-merge', type: 'merge', title: 'Merge', description: 'Combine multiple perspectives.', dependsOn: ['broadcast-chatgpt', 'broadcast-gemini', 'broadcast-claude'], outputVar: 'broadcast_summary' },
        { id: 'broadcast-output', type: 'output', title: 'Final Output', dependsOn: ['broadcast-merge'], outputVar: 'final_output' },
      ]
    case 'relay':
      return [
        { id: 'relay-topic', type: 'prompt', title: 'Seed Prompt', prompt: 'Create the initial outline: {{seed}}', dependsOn: [], outputVar: 'seed' },
        { id: 'relay-1', type: 'agent', title: 'First Pass', provider: 'chatgpt', prompt: 'Expand the initial outline: {{seed}}', dependsOn: ['relay-topic'], outputVar: 'step_one' },
        { id: 'relay-2', type: 'agent', title: 'Second Pass', provider: 'gemini', prompt: 'Refine the expanded outline: {{step_one}}', dependsOn: ['relay-1'], outputVar: 'step_two' },
        { id: 'relay-3', type: 'agent', title: 'Final Pass', provider: 'claude', prompt: 'Turn the refined outline into a final answer: {{step_two}}', dependsOn: ['relay-2'], outputVar: 'relay_result' },
        { id: 'relay-output', type: 'output', title: 'Final Output', dependsOn: ['relay-3'], outputVar: 'final_output' },
      ]
    case 'debate':
      return [
        { id: 'debate-topic', type: 'prompt', title: 'Debate Topic', prompt: 'Debate the topic: {{topic}}', dependsOn: [], outputVar: 'topic' },
        { id: 'debate-pro', type: 'agent', title: 'Pro', provider: 'chatgpt', prompt: 'Argue for the topic: {{topic}}', dependsOn: ['debate-topic'], outputVar: 'pro_argument' },
        { id: 'debate-con', type: 'agent', title: 'Con', provider: 'gemini', prompt: 'Argue against the topic: {{topic}}', dependsOn: ['debate-topic'], outputVar: 'con_argument' },
        { id: 'debate-merge', type: 'merge', title: 'Debate Summary', description: 'Summarize both sides.', dependsOn: ['debate-pro', 'debate-con'], outputVar: 'debate_summary' },
        { id: 'debate-output', type: 'output', title: 'Final Output', dependsOn: ['debate-merge'], outputVar: 'final_output' },
      ]
    case 'subagent':
      return [
        { id: 'subagent-brief', type: 'prompt', title: 'Task Brief', prompt: 'Prepare the task brief: {{brief}}', dependsOn: [], outputVar: 'brief' },
        { id: 'subagent-master', type: 'agent', title: 'Master Agent', provider: 'chatgpt', prompt: 'Plan the work and delegate subtasks: {{brief}}', dependsOn: ['subagent-brief'], outputVar: 'master_plan' },
        { id: 'subagent-worker', type: 'agent', title: 'Worker Agent', provider: 'claude', prompt: 'Complete the detailed execution steps: {{master_plan}}', dependsOn: ['subagent-master'], outputVar: 'worker_detail' },
        { id: 'subagent-merge', type: 'merge', title: 'Merge', dependsOn: ['subagent-master', 'subagent-worker'], outputVar: 'subagent_result' },
        { id: 'subagent-output', type: 'output', title: 'Final Output', dependsOn: ['subagent-merge'], outputVar: 'final_output' },
      ]
  }
}

function convertNodesToSteps(nodes: BlueprintNode[]): BlueprintStep[] {
  const levelMap = buildLevelMap(nodes)
  return [...nodes]
    .sort((a, b) => (levelMap.get(a.id) ?? 0) - (levelMap.get(b.id) ?? 0))
    .map(node => ({
      id: node.id,
      type: node.type,
      title: node.title,
      description: node.description,
      prompt: node.prompt,
      aiNodeId: node.aiNodeId,
      provider: node.agent?.provider,
      dependsOn: [...node.dependsOn],
      outputVar: node.outputVar,
      tool: node.tool,
      condition: node.condition,
    }))
}

function buildAutoLayout(steps: BlueprintStep[]): Map<string, BlueprintPosition> {
  const levelMap = new Map<string, number>()
  const byId = new Map(steps.map(step => [step.id, step]))

  const assignLevel = (step: BlueprintStep): number => {
    if (levelMap.has(step.id)) return levelMap.get(step.id) || 0
    if (step.dependsOn.length === 0) {
      levelMap.set(step.id, 0)
      return 0
    }
    const level = Math.max(...step.dependsOn.map(depId => assignLevel(byId.get(depId) || { ...step, id: depId, dependsOn: [] } as BlueprintStep)), 0) + 1
    levelMap.set(step.id, level)
    return level
  }

  steps.forEach(assignLevel)
  const rows = new Map<number, BlueprintStep[]>()
  steps.forEach(step => {
    const level = levelMap.get(step.id) || 0
    rows.set(level, [...(rows.get(level) || []), step])
  })

  const positions = new Map<string, BlueprintPosition>()
  for (const [level, row] of rows.entries()) {
    row.forEach((step, index) => {
      positions.set(step.id, {
        x: 120 + level * 320,
        y: 140 + index * 170,
      })
    })
  }
  return positions
}

function buildLevelMap(nodes: BlueprintNode[]): Map<string, number> {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const levelMap = new Map<string, number>()
  const visit = (node: BlueprintNode): number => {
    if (levelMap.has(node.id)) return levelMap.get(node.id) || 0
    if (node.dependsOn.length === 0) {
      levelMap.set(node.id, 0)
      return 0
    }
    const level = Math.max(...node.dependsOn.map(depId => {
      const dep = byId.get(depId)
      return dep ? visit(dep) : 0
    }), 0) + 1
    levelMap.set(node.id, level)
    return level
  }
  nodes.forEach(visit)
  return levelMap
}

function inferTemplateId(id: string): BlueprintTemplateId {
  if (id === 'prompt-chain') return 'prompt-chain'
  if (id === 'broadcast-workflow') return 'broadcast'
  if (id === 'relay-workflow') return 'relay'
  if (id === 'debate-workflow') return 'debate'
  if (id === 'subagent-workflow') return 'subagent'
  return 'custom'
}

const TEMPLATE_METADATA: Record<Exclude<BlueprintTemplateId, 'custom'>, { id: string; name: string; description: string }> = {
  'prompt-chain': {
    id: 'prompt-chain',
    name: 'Simple Prompt Chain',
    description: 'Use a prompt step and send the result into a single agent.',
  },
  broadcast: {
    id: 'broadcast-workflow',
    name: 'Broadcast Workflow',
    description: 'Send the same topic to multiple AI nodes and merge the results.',
  },
  relay: {
    id: 'relay-workflow',
    name: 'Relay Workflow',
    description: 'Pass each step result into the next AI node in sequence.',
  },
  debate: {
    id: 'debate-workflow',
    name: 'Debate Workflow',
    description: 'Generate opposing views and merge them into a conclusion.',
  },
  subagent: {
    id: 'subagent-workflow',
    name: 'Subagent Workflow',
    description: 'Use a planner/worker pattern for decomposition and execution.',
  },
}

const BUILTIN_WORKFLOW_IDS = new Set([
  'prompt-chain',
  'broadcast-workflow',
  'relay-workflow',
  'debate-workflow',
  'subagent-workflow',
])
