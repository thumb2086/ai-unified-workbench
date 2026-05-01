import { createContext, ReactNode, useContext, useMemo } from 'react'
import { useStorage } from './useStorage'
import {
  AiNode,
  ChatThread,
  Language,
  WorkbenchState,
  WorkflowBlueprint,
  createDefaultAiNodes,
  createDefaultWorkflows,
  createEmptyAiNode,
  createEmptyWorkflow,
} from '../types/workbench'

interface WorkbenchContextValue extends WorkbenchState {
  setLanguage: (language: Language) => void
  setActiveWorkflowId: (workflowId: string | null) => void
  setActiveChatThreadId: (threadId: string | null) => void
  setActiveAiNodeId: (nodeId: string | null) => void
  setAiNodes: (value: AiNode[] | ((prev: AiNode[]) => AiNode[])) => void
  setWorkflows: (value: WorkflowBlueprint[] | ((prev: WorkflowBlueprint[]) => WorkflowBlueprint[])) => void
  setChatThreads: (value: ChatThread[] | ((prev: ChatThread[]) => ChatThread[])) => void
  addAiNode: (kind?: 'web' | 'api') => AiNode
  updateAiNode: (nodeId: string, updater: (node: AiNode) => AiNode) => void
  deleteAiNode: (nodeId: string) => void
  duplicateAiNode: (nodeId: string) => AiNode | null
  addWorkflow: () => WorkflowBlueprint
  updateWorkflow: (workflowId: string, updater: (workflow: WorkflowBlueprint) => WorkflowBlueprint) => void
  deleteWorkflow: (workflowId: string) => void
  addChatThread: (thread?: Partial<ChatThread>) => ChatThread
  updateChatThread: (threadId: string, updater: (thread: ChatThread) => ChatThread) => void
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [aiNodes, setAiNodes] = useStorage<AiNode[]>('ai-workbench.ai-nodes.v2', createDefaultAiNodes())
  const [workflows, setWorkflows] = useStorage<WorkflowBlueprint[]>('ai-workbench.workflows.v2', createDefaultWorkflows())
  const [chatThreads, setChatThreads] = useStorage<ChatThread[]>('ai-workbench.chat-threads.v2', [])
  const [language, setLanguage] = useStorage<Language>('ai-workbench.language.v2', 'zh')
  const [activeWorkflowId, setActiveWorkflowId] = useStorage<string | null>('ai-workbench.active-workflow.v2', workflows[0]?.id ?? null)
  const [activeChatThreadId, setActiveChatThreadId] = useStorage<string | null>('ai-workbench.active-chat-thread.v2', null)
  const [activeAiNodeId, setActiveAiNodeId] = useStorage<string | null>('ai-workbench.active-ai-node.v2', aiNodes[0]?.id ?? null)

  const value = useMemo<WorkbenchContextValue>(() => ({
    aiNodes,
    workflows,
    chatThreads,
    language,
    activeWorkflowId,
    activeChatThreadId,
    activeAiNodeId,
    setLanguage,
    setActiveWorkflowId,
    setActiveChatThreadId,
    setActiveAiNodeId,
    setAiNodes,
    setWorkflows,
    setChatThreads,
    addAiNode: (kind = 'web') => {
      const node = createEmptyAiNode(kind)
      setAiNodes(prev => [node, ...prev])
      setActiveAiNodeId(node.id)
      return node
    },
    updateAiNode: (nodeId, updater) => {
      setAiNodes(prev => prev.map(node => node.id === nodeId ? updater(node) : node))
    },
    deleteAiNode: (nodeId) => {
      setAiNodes(prev => {
        const next = prev.filter(node => node.id !== nodeId)
        if (activeAiNodeId === nodeId) {
          setActiveAiNodeId(next[0]?.id ?? null)
        }
        return next
      })
      setWorkflows(prev => prev.map(workflow => ({
        ...workflow,
        nodes: workflow.nodes.map(node => node.aiNodeId === nodeId ? { ...node, aiNodeId: undefined } : node),
      })))
      setChatThreads(prev => prev.map(thread => ({
        ...thread,
        selection: {
          ...thread.selection,
          providerIds: thread.selection.providerIds.filter(id => id !== nodeId),
        },
      })))
    },
    duplicateAiNode: (nodeId) => {
      const source = aiNodes.find(node => node.id === nodeId)
      if (!source) return null
      const now = new Date().toISOString()
      const clone: AiNode = {
        ...source,
        id: `ai-${Date.now()}`,
        name: `${source.name} Copy`,
        createdAt: now,
        updatedAt: now,
      }
      setAiNodes(prev => [clone, ...prev])
      setActiveAiNodeId(clone.id)
      return clone
    },
    addWorkflow: () => {
      const workflow = createEmptyWorkflow()
      setWorkflows(prev => [workflow, ...prev])
      setActiveWorkflowId(workflow.id)
      return workflow
    },
    updateWorkflow: (workflowId, updater) => {
      setWorkflows(prev => prev.map(workflow => workflow.id === workflowId ? updater(workflow) : workflow))
    },
    deleteWorkflow: (workflowId) => {
      setWorkflows(prev => {
        const next = prev.filter(workflow => workflow.id !== workflowId)
        if (activeWorkflowId === workflowId) {
          setActiveWorkflowId(next[0]?.id ?? null)
        }
        return next
      })
    },
    addChatThread: (thread = {}) => {
      const now = new Date().toISOString()
      const created: ChatThread = {
        id: `chat-${Date.now()}`,
        selection: {
          providerIds: thread.selection?.providerIds ?? [],
          mode: thread.selection?.mode ?? 'broadcast',
          workflowId: thread.selection?.workflowId,
        },
        prompt: thread.prompt ?? '',
        topic: thread.topic,
        messages: thread.messages ?? [],
        updatedAt: now,
      }
      setChatThreads(prev => [created, ...prev])
      setActiveChatThreadId(created.id)
      return created
    },
    updateChatThread: (threadId, updater) => {
      setChatThreads(prev => prev.map(thread => thread.id === threadId ? updater(thread) : thread))
    },
  }), [
    aiNodes,
    workflows,
    chatThreads,
    language,
    activeWorkflowId,
    activeChatThreadId,
    activeAiNodeId,
    setAiNodes,
    setWorkflows,
    setChatThreads,
    setLanguage,
    setActiveWorkflowId,
    setActiveChatThreadId,
    setActiveAiNodeId,
  ])

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>
}

export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext)
  if (!context) {
    throw new Error('useWorkbench must be used within WorkbenchProvider')
  }
  return context
}
