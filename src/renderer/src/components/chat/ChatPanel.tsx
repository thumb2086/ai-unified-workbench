import { useEffect, useMemo, useState } from 'react'
import { useWorkbench } from '../../hooks/useWorkbenchState'
import { useI18n } from '../../hooks/useI18n'
import { useStorage } from '../../hooks/useStorage'
import type { AiNode, ChatMessage, ChatMode } from '../../types/workbench'
import { executeWorkflow } from '../../engine/workflow-engine'
import { toProviderConfig, toWorkflowDefinition } from '../../utils/workbench'
import { openBrowser, readFromBrowser, sendChatRequest, sendToBrowser } from '../../services/api'

type PanelState = {
  status: 'idle' | 'working' | 'done' | 'error'
  content: string
  error?: string
}

export function ChatPanel() {
  const { t } = useI18n()
  const {
    aiNodes,
    workflows,
    activeWorkflowId,
    chatThreads,
    activeChatThreadId,
    setActiveChatThreadId,
    addChatThread,
    updateChatThread,
    updateAiNode,
  } = useWorkbench()

  const activeThread = useMemo(
    () => chatThreads.find(thread => thread.id === activeChatThreadId) ?? null,
    [chatThreads, activeChatThreadId],
  )

  const [mode, setMode] = useStorage<ChatMode>(
    'ai-workbench.chat.mode.v2',
    activeThread?.selection.mode ?? 'broadcast',
  )
  const [selectedIds, setSelectedIds] = useStorage<string[]>(
    'ai-workbench.chat.providers.v2',
    activeThread?.selection.providerIds ?? aiNodes.slice(0, 2).map(node => node.id),
  )
  const [workflowId, setWorkflowId] = useStorage<string>(
    'ai-workbench.chat.workflow.v2',
    activeThread?.selection.workflowId ?? activeWorkflowId ?? '',
  )
  const [prompt, setPrompt] = useStorage<string>('ai-workbench.chat.prompt.v2', activeThread?.prompt ?? '')
  const [topic, setTopic] = useStorage<string>('ai-workbench.chat.topic.v2', activeThread?.topic ?? '')
  const [panelStates, setPanelStates] = useState<Record<string, PanelState>>({})
  const [workflowResult, setWorkflowResult] = useState<string>('')
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (!activeThread) return
    setActiveChatThreadId(activeThread.id)
    setMode(activeThread.selection.mode)
    setSelectedIds(activeThread.selection.providerIds)
    setWorkflowId(activeThread.selection.workflowId ?? '')
    setPrompt(activeThread.prompt)
    setTopic(activeThread.topic ?? '')
  }, [activeThread, setActiveChatThreadId, setMode, setSelectedIds, setWorkflowId, setPrompt, setTopic])

  useEffect(() => {
    if (!workflowId && activeWorkflowId) {
      setWorkflowId(activeWorkflowId)
    }
  }, [workflowId, activeWorkflowId, setWorkflowId])

  useEffect(() => {
    const preset = getPresetWorkflowId(mode)
    if (preset && workflowId !== preset && workflows.some(workflow => workflow.id === preset)) {
      setWorkflowId(preset)
    }
  }, [mode, workflowId, workflows, setWorkflowId])

  const selectedNodes = useMemo(
    () => selectedIds.map(id => aiNodes.find(node => node.id === id)).filter(Boolean) as AiNode[],
    [aiNodes, selectedIds],
  )

  const ensureThread = () => {
    const now = new Date().toISOString()
    if (activeThread) {
      updateChatThread(activeThread.id, thread => ({
        ...thread,
        selection: { providerIds: selectedIds, mode, workflowId },
        prompt,
        topic,
        updatedAt: now,
      }))
      return activeThread.id
    }

    return addChatThread({
      selection: { providerIds: selectedIds, mode, workflowId },
      prompt,
      topic,
    }).id
  }

  const toggleNode = (nodeId: string) => {
    setSelectedIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId])
  }

  const setWorkflowMode = (nextMode: ChatMode) => {
    setMode(nextMode)
    const preset = getPresetWorkflowId(nextMode)
    if (preset) {
      setWorkflowId(preset)
    }
  }

  const setPanelState = (nodeId: string, next: PanelState) => {
    setPanelStates(prev => ({ ...prev, [nodeId]: next }))
  }

  const sendToNode = async (node: AiNode, message: string): Promise<string> => {
    if (!message.trim()) return ''

    if (node.kind === 'api') {
      const result = await sendChatRequest(toProviderConfig(node), message, {
        conversationKey: node.conversationKey || node.id,
      })
      if (result.error) throw new Error(result.error)
      return result.content
    }

    const openResult = await openBrowser(node.provider, node.webUrl || 'https://chatgpt.com/', {
      providerName: node.name,
      sessionId: node.sessionId,
    })
    if (openResult.error || !openResult.sessionId) {
      throw new Error(openResult.error || 'Failed to open browser session')
    }

    if (!node.sessionId || node.sessionId !== openResult.sessionId) {
      updateAiNode(node.id, current => ({
        ...current,
        sessionId: openResult.sessionId,
        updatedAt: new Date().toISOString(),
      }))
    }

    const sendResult = await sendToBrowser(openResult.sessionId, message)
    if (sendResult.error) throw new Error(sendResult.error)

    await new Promise(resolve => setTimeout(resolve, 1200))
    const readResult = await readFromBrowser(openResult.sessionId)
    if (readResult.error) throw new Error(readResult.error)
    return readResult.content || ''
  }

  const handleDirectSend = async () => {
    if (!selectedNodes.length || !prompt.trim()) return

    const threadId = ensureThread()
    const now = new Date().toISOString()
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      providerId: 'user',
      role: 'user',
      content: prompt,
      timestamp: now,
    }

    updateChatThread(threadId, thread => ({
      ...thread,
      messages: [...thread.messages, userMessage],
      updatedAt: now,
    }))

    setPanelStates(Object.fromEntries(selectedNodes.map(node => [node.id, { status: 'working', content: '' }])))

    if (mode === 'relay' || mode === 'subagent') {
      let currentPrompt = prompt
      for (const [index, node] of selectedNodes.entries()) {
        try {
          const content = await sendToNode(
            node,
            mode === 'relay'
              ? currentPrompt
              : index === 0
                ? `你是主代理，請先整理任務並輸出可交辦的摘要：\n${currentPrompt}`
                : `你是子代理，請根據主代理的輸出補充細節：\n${currentPrompt}`,
          )

          setPanelState(node.id, { status: 'done', content })
          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}-${node.id}`,
            providerId: node.id,
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
          }
          updateChatThread(threadId, thread => ({
            ...thread,
            messages: [...thread.messages, assistantMessage],
            updatedAt: new Date().toISOString(),
          }))

          currentPrompt = mode === 'relay'
            ? `${currentPrompt}\n\n${node.name}：\n${content}`
            : `${content}\n\n請繼續補充下一步。`
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Request failed'
          setPanelState(node.id, { status: 'error', content: '', error: message })
          break
        }
      }

      setPrompt('')
      return
    }

    if (mode === 'debate') {
      const debateTopic = topic.trim() || prompt.trim()
      for (let round = 0; round < 2; round += 1) {
        for (const node of selectedNodes) {
          try {
            const content = await sendToNode(
              node,
              round === 0
                ? `請針對下列主題提出第一輪觀點：${debateTopic}`
                : `請根據上輪內容繼續反駁或補充：${debateTopic}`,
            )

            setPanelState(node.id, { status: 'done', content })
            const assistantMessage: ChatMessage = {
              id: `msg-${Date.now()}-${node.id}-${round}`,
              providerId: node.id,
              role: 'assistant',
              content,
              timestamp: new Date().toISOString(),
            }
            updateChatThread(threadId, thread => ({
              ...thread,
              messages: [...thread.messages, assistantMessage],
              updatedAt: new Date().toISOString(),
            }))
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Request failed'
            setPanelState(node.id, { status: 'error', content: '', error: message })
          }
        }
      }

      setPrompt('')
      return
    }

    await Promise.all(selectedNodes.map(async node => {
      try {
        const content = await sendToNode(node, prompt)
        setPanelState(node.id, { status: 'done', content })
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-${node.id}`,
          providerId: node.id,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        }
        updateChatThread(threadId, thread => ({
          ...thread,
          messages: [...thread.messages, assistantMessage],
          updatedAt: new Date().toISOString(),
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request failed'
        setPanelState(node.id, { status: 'error', content: '', error: message })
      }
    }))

    setPrompt('')
  }

  const handleRunWorkflow = async () => {
    const workflow = workflows.find(item => item.id === workflowId)
    if (!workflow) return
    setWorkflowStatus('running')
    setWorkflowResult('')
    const result = await executeWorkflow(toWorkflowDefinition(workflow), { aiNodes })
    setWorkflowStatus(result.success ? 'success' : 'error')
    setWorkflowResult(JSON.stringify(result, null, 2))
  }

  return (
    <div className="chat-layout">
      <aside className="panel sidebar-panel chat-sidebar">
        <div className="panel-head">
          <div>
            <h2>{t('chat.selectProviders')}</h2>
            <p className="muted">{t('chat.subtitle')}</p>
          </div>
        </div>

        <div className="stack">
          <button onClick={() => setSelectedIds(aiNodes.map(node => node.id))}>{t('common.selectAll')}</button>
          <button onClick={() => setSelectedIds([])}>{t('common.clearAll')}</button>
        </div>

        <div className="node-list">
          {aiNodes.map(node => (
            <label key={node.id} className="node-list-item checkbox-item">
              <input
                type="checkbox"
                checked={selectedIds.includes(node.id)}
                onChange={() => toggleNode(node.id)}
              />
              <div className="checkbox-copy">
                <strong>{node.name}</strong>
                <span className="muted">{node.kind.toUpperCase()} · {node.provider}</span>
              </div>
            </label>
          ))}
        </div>
      </aside>

      <main className="panel chat-main">
        <div className="panel-head split">
          <div>
            <h2>{t('chat.title')}</h2>
            <p className="muted">{t('chat.subtitle')}</p>
          </div>
          <div className="row">
            <button className={mode === 'broadcast' ? 'primary' : ''} onClick={() => setWorkflowMode('broadcast')}>
              {t('chat.broadcast')}
            </button>
            <button className={mode === 'relay' ? 'primary' : ''} onClick={() => setWorkflowMode('relay')}>
              {t('chat.relay')}
            </button>
            <button className={mode === 'debate' ? 'primary' : ''} onClick={() => setWorkflowMode('debate')}>
              {t('chat.debate')}
            </button>
            <button className={mode === 'subagent' ? 'primary' : ''} onClick={() => setWorkflowMode('subagent')}>
              {t('chat.subagent')}
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label>
            <span>{t('chat.selectWorkflow')}</span>
            <select value={workflowId} onChange={event => setWorkflowId(event.target.value)}>
              <option value="">--</option>
              {workflows.map(workflow => (
                <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('chat.topic')}</span>
            <input value={topic} onChange={event => setTopic(event.target.value)} placeholder={t('chat.topic')} />
          </label>
        </div>

        <label className="stack">
          <span>{t('chat.prompt')}</span>
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={t('chat.prompt')} />
        </label>

        <div className="row">
          <button
            className="primary"
            disabled={
              !selectedNodes.length
              || (mode === 'debate' ? !(topic.trim() || prompt.trim()) : !prompt.trim())
            }
            onClick={() => void handleDirectSend()}
          >
            {t('chat.send')}
          </button>
          <button onClick={() => {
            setPrompt('')
            setTopic('')
            setPanelStates({})
            setWorkflowResult('')
          }}>
            {t('chat.reset')}
          </button>
          {workflowId && (
            <button onClick={() => void handleRunWorkflow()}>
              {t('workflow.run')}
            </button>
          )}
        </div>

        <section className="results-section">
          <div className="panel-head">
            <h3>{t('chat.responsePanels')}</h3>
            <span className="muted">{t('common.selected')} {selectedNodes.length}</span>
          </div>
          <div className="response-grid">
            {selectedNodes.length === 0 ? (
              <div className="empty-state">
                <h3>{t('common.noSelection')}</h3>
                <p>{t('chat.selectProviders')}</p>
              </div>
            ) : (
              selectedNodes.map(node => {
                const panel = panelStates[node.id] ?? { status: 'idle', content: '' }
                return (
                  <article key={node.id} className="response-card">
                    <div className="response-head">
                      <div>
                        <strong>{node.name}</strong>
                        <div className="muted">{node.kind.toUpperCase()} · {node.provider}</div>
                      </div>
                      <span className={`pill ${panel.status}`}>{panel.status}</span>
                    </div>
                    <pre className="response-output">{panel.content || panel.error || '...'}</pre>
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="results-section">
          <div className="panel-head">
            <h3>{t('chat.workflowRun')}</h3>
            <span className={`pill ${workflowStatus}`}>{workflowStatus}</span>
          </div>
          <pre className="workflow-output">{workflowResult || '尚未執行工作流。'}</pre>
        </section>

        {activeThread && (
          <section className="results-section">
            <div className="panel-head">
              <h3>{t('chat.sessionHistory')}</h3>
              <span className="muted">{t('chat.messages')} {activeThread.messages.length}</span>
            </div>
            <div className="history-list">
              {activeThread.messages.slice(-6).map(message => (
                <div key={message.id} className={`history-item ${message.role}`}>
                  <strong>{message.role === 'user' ? '使用者' : 'AI 回應'}</strong>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function getPresetWorkflowId(mode: ChatMode): string {
  switch (mode) {
    case 'broadcast':
      return 'broadcast-workflow'
    case 'relay':
      return 'relay-workflow'
    case 'debate':
      return 'debate-workflow'
    case 'subagent':
      return 'subagent-workflow'
    default:
      return ''
  }
}
