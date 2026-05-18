import { useEffect, useMemo, useState } from 'react'
import type { AiNode } from '../../types/workbench'
import { useI18n } from '../../hooks/useI18n'
import { useWorkbench } from '../../hooks/useWorkbenchState'
import {
  BrowserSessionRecord,
  createBrowserSessionRecord,
  loadBrowserSessions,
  removeBrowserSession,
  saveBrowserSessions,
  upsertBrowserSession,
} from '../../services/browser-session-store'
import {
  clearBrowserSession,
  closeBrowserSession,
  listBrowserProviderMatrix,
  listRemoteBrowserSessions,
  openBrowser,
  readFromBrowser,
  setBrowserModel,
  sendToBrowser,
} from '../../services/api'
import './WebviewPool.css'

type ProviderGroup = {
  providerId: string
  providerName: string
  nodes: AiNode[]
}

type ProviderMatrixEntry = {
  providerId: string
  providerName: string
  supportsPromptInput: boolean
  supportsResponseRead: boolean
  supportsModelSelection: boolean
  supportedEntryUrls: string[]
  notes: string[]
}

export function WebviewPool() {
  const { t } = useI18n()
  const { aiNodes, activeAiNodeId, setActiveAiNodeId, updateAiNode, addAiNode } = useWorkbench()
  const webNodes = useMemo(() => aiNodes.filter(node => node.kind === 'web'), [aiNodes])
  const groups = useMemo(() => groupWebNodes(webNodes), [webNodes])
  const [sessions, setSessions] = useState<BrowserSessionRecord[]>(() => loadBrowserSessions())
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(groups[0]?.providerId ?? null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(webNodes[0]?.id ?? null)
  const [promptDraft, setPromptDraft] = useState('')
  const [responseText, setResponseText] = useState('')
  const [busySessionId, setBusySessionId] = useState<string | null>(null)
  const [providerMatrix, setProviderMatrix] = useState<ProviderMatrixEntry[]>([])
  const [modelStatus, setModelStatus] = useState('')

  useEffect(() => {
    saveBrowserSessions(sessions)
  }, [sessions])

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedProviderId(null)
      return
    }
    if (!selectedProviderId || !groups.some(group => group.providerId === selectedProviderId)) {
      setSelectedProviderId(groups[0].providerId)
    }
  }, [groups, selectedProviderId])

  useEffect(() => {
    const node = webNodes.find(item => item.id === activeAiNodeId)
    if (node) {
      setSelectedNodeId(node.id)
      setSelectedProviderId(node.provider)
    }
  }, [activeAiNodeId, webNodes])

  useEffect(() => {
    void refreshRemoteSessions()
    void refreshProviderMatrix()
  }, [])

  useEffect(() => {
    setModelStatus('')
  }, [selectedNodeId])

  const selectedGroup = groups.find(group => group.providerId === selectedProviderId) ?? groups[0] ?? null
  const selectedNode = selectedGroup?.nodes.find(node => node.id === selectedNodeId) ?? selectedGroup?.nodes[0] ?? null
  const selectedMatrix = providerMatrix.find(item => item.providerId === selectedNode?.provider) ?? null

  const createWebNode = () => {
    const node = addAiNode('web')
    setActiveAiNodeId(node.id)
    setSelectedNodeId(node.id)
    setSelectedProviderId(node.provider)
  }

  const refreshRemoteSessions = async () => {
    const remote = await listRemoteBrowserSessions()
    if (remote.length === 0) return
    const mapped: BrowserSessionRecord[] = remote.map(session => ({
      sessionId: session.id,
      providerId: session.providerId,
      providerName: session.providerName,
      url: session.url,
      status: 'ready',
      createdAt: new Date(session.createdAt).toISOString(),
      lastActiveAt: new Date(session.updatedAt).toISOString(),
      accountLabel: session.accountLabel,
      accountKey: session.accountKey,
    }))
    setSessions(current => mergeSessions(current, mapped))
  }

  const refreshProviderMatrix = async () => {
    setProviderMatrix(await listBrowserProviderMatrix())
  }

  const ensureSession = async (node: AiNode, forceNew = false) => {
    const url = node.webUrl || getDefaultUrl(node.provider)
    const result = await openBrowser(node.provider, url, {
      providerName: node.name,
      sessionId: forceNew ? undefined : node.sessionId,
      forceNew,
      accountLabel: node.accountLabel,
      accountKey: node.accountKey,
      model: node.model,
    })

    if (result.error || !result.sessionId) {
      window.alert(result.error || t('webControl.openFailed'))
      return null
    }

    const record = createBrowserSessionRecord(
      node.provider,
      node.name,
      url,
      result.sessionId,
      { label: node.accountLabel, key: node.accountKey },
    )
    record.status = 'ready'
    upsertBrowserSession(record)
    setSessions(loadBrowserSessions())

    updateAiNode(node.id, current => ({
      ...current,
      sessionId: result.sessionId,
      webUrl: url,
      updatedAt: new Date().toISOString(),
    }))

    return result.sessionId
  }

  const handleOpenSession = async (forceNew = false) => {
    if (!selectedNode) return
    setBusySessionId(selectedNode.sessionId || selectedNode.id)
    try {
      await ensureSession(selectedNode, forceNew)
      await refreshRemoteSessions()
    } finally {
      setBusySessionId(null)
    }
  }

  const handleSendPrompt = async () => {
    if (!selectedNode || !promptDraft.trim()) return
    setBusySessionId(selectedNode.sessionId || selectedNode.id)
    try {
      const sessionId = selectedNode.sessionId || await ensureSession(selectedNode)
      if (!sessionId) return
      const result = await sendToBrowser(sessionId, promptDraft)
      if (result.error) {
        window.alert(result.error)
        return
      }
      setSessions(current => current.map(session =>
        session.sessionId === sessionId
          ? { ...session, status: 'busy', lastActiveAt: new Date().toISOString() }
          : session,
      ))
    } finally {
      setBusySessionId(null)
    }
  }

  const handleReadResponse = async () => {
    if (!selectedNode?.sessionId) return
    setBusySessionId(selectedNode.sessionId)
    try {
      const response = await readFromBrowser(selectedNode.sessionId)
      if (response.error) {
        window.alert(response.error)
        return
      }
      setResponseText(response.content || '')
      setSessions(current => current.map(session =>
        session.sessionId === selectedNode.sessionId
          ? { ...session, status: 'ready', lastActiveAt: new Date().toISOString(), lastError: undefined }
          : session,
      ))
    } finally {
      setBusySessionId(null)
    }
  }

  const handleApplyModel = async () => {
    if (!selectedNode?.model?.trim()) return

    if (!selectedNode.sessionId) {
      setModelStatus(t('webControl.modelStatusSaved'))
      return
    }

    setBusySessionId(selectedNode.sessionId)
    try {
      const result = await setBrowserModel(selectedNode.sessionId, selectedNode.model)
      if (result.error) {
        window.alert(result.error)
        return
      }
      setModelStatus(
        result.status === 'saved-preference-only'
          ? t('webControl.modelStatusSaved')
          : t('webControl.modelStatusApplied'),
      )
      await refreshRemoteSessions()
    } finally {
      setBusySessionId(null)
    }
  }

  const handleCloseSession = async () => {
    if (!selectedNode?.sessionId) return
    await closeBrowserSession(selectedNode.sessionId)
    removeBrowserSession(selectedNode.sessionId)
    setSessions(loadBrowserSessions())
    updateAiNode(selectedNode.id, current => ({
      ...current,
      sessionId: undefined,
      updatedAt: new Date().toISOString(),
    }))
  }

  const handleClearSession = async () => {
    if (!selectedNode?.sessionId) return
    await clearBrowserSession(selectedNode.sessionId)
    setSessions(loadBrowserSessions())
    updateAiNode(selectedNode.id, current => ({
      ...current,
      sessionId: undefined,
      updatedAt: new Date().toISOString(),
    }))
  }

  return (
    <div className="controlled-web-page">
      <div className="controlled-web-sidebar">
        <div>
          <h2>{t('webControl.title')}</h2>
          <p className="muted">{t('webControl.subtitle')}</p>
        </div>

        <button className="primary" onClick={createWebNode}>{t('webControl.createNode')}</button>
        <button onClick={() => void refreshRemoteSessions()}>{t('webControl.refreshSessions')}</button>

        <div className="provider-workspace-tabs" role="tablist" aria-label="Web providers">
          {groups.map(group => (
            <button
              key={group.providerId}
              className={`provider-workspace-tab ${group.providerId === selectedGroup?.providerId ? 'active' : ''}`}
              onClick={() => {
                setSelectedProviderId(group.providerId)
                setSelectedNodeId(group.nodes[0]?.id ?? null)
                setActiveAiNodeId(group.nodes[0]?.id ?? null)
              }}
            >
              <span className="provider-mark">{getProviderMark(group.providerId)}</span>
              <span>
                <strong>{group.providerName}</strong>
                <small>{group.nodes.length} nodes</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="controlled-web-main">
        {!selectedGroup || !selectedNode ? (
          <div className="empty-state">
            <p>{t('webControl.noNode')}</p>
            <p>{t('webControl.noNodeHint')}</p>
          </div>
        ) : (
          <>
            <div className="node-tab-strip">
              {selectedGroup.nodes.map(node => {
                const session = node.sessionId ? sessions.find(item => item.sessionId === node.sessionId) : null
                const status = session?.status || t('webControl.statusLoading')
                return (
                  <button
                    key={node.id}
                    className={`node-subtab ${node.id === selectedNode.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedNodeId(node.id)
                      setActiveAiNodeId(node.id)
                    }}
                  >
                    <span>
                      <strong>{node.name}</strong>
                      <small>{node.accountLabel || node.provider}</small>
                    </span>
                    <span className={`session-state ${session?.status || 'loading'}`}>{status}</span>
                  </button>
                )
              })}
              <button className="node-subtab add" onClick={createWebNode}>+</button>
            </div>

            <div className="controlled-web-toolbar">
              <div>
                <h3>{selectedNode.name}</h3>
                <p className="muted">{selectedNode.webUrl || getDefaultUrl(selectedNode.provider)}</p>
              </div>
              <div className="row">
                <button onClick={() => void handleOpenSession(false)} disabled={busySessionId === (selectedNode.sessionId || selectedNode.id)}>
                  {selectedNode.sessionId ? t('webControl.focusSession') : t('webControl.openSession')}
                </button>
                <button onClick={() => void handleOpenSession(true)}>{t('webControl.newSession')}</button>
                <button onClick={() => void handleReadResponse()} disabled={!selectedNode.sessionId}>{t('webControl.readResponse')}</button>
                <button onClick={() => void handleCloseSession()} disabled={!selectedNode.sessionId}>{t('webControl.closeSession')}</button>
                <button className="danger" onClick={() => void handleClearSession()} disabled={!selectedNode.sessionId}>{t('webControl.clearProfile')}</button>
              </div>
            </div>

            <div className="controlled-web-content" style={{ display: 'grid', gap: 16 }}>
              <div className="card stack">
                <div className="panel-head">
                  <strong>{t('webControl.sessionInfo')}</strong>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Session ID</span>
                    <input value={selectedNode.sessionId || ''} readOnly />
                  </label>
                  <label>
                    <span>{t('webControl.accountLabel')}</span>
                    <input
                      value={selectedNode.accountLabel || ''}
                      onChange={event => updateAiNode(selectedNode.id, current => ({
                        ...current,
                        accountLabel: event.target.value,
                        updatedAt: new Date().toISOString(),
                      }))}
                    />
                  </label>
                  <label>
                    <span>{t('webControl.accountKey')}</span>
                    <input
                      value={selectedNode.accountKey || ''}
                      onChange={event => updateAiNode(selectedNode.id, current => ({
                        ...current,
                        accountKey: event.target.value,
                        updatedAt: new Date().toISOString(),
                      }))}
                    />
                  </label>
                  <label>
                    <span>URL</span>
                    <input
                      value={selectedNode.webUrl || getDefaultUrl(selectedNode.provider)}
                      onChange={event => updateAiNode(selectedNode.id, current => ({
                        ...current,
                        webUrl: event.target.value,
                        updatedAt: new Date().toISOString(),
                      }))}
                    />
                  </label>
                  <label>
                    <span>{t('nodes.browserModel')}</span>
                    <input
                      value={selectedNode.model || ''}
                      onChange={event => updateAiNode(selectedNode.id, current => ({
                        ...current,
                        model: event.target.value,
                        updatedAt: new Date().toISOString(),
                      }))}
                      placeholder="gpt-4o / gemini-2.5-pro / gemma-3 / claude sonnet"
                    />
                  </label>
                </div>
                <p className="muted">{t('nodes.browserModelHint')}</p>
                <div className="row">
                  <button onClick={() => void handleApplyModel()} disabled={!selectedNode.model?.trim()}>
                    {t('webControl.applyModel')}
                  </button>
                  {modelStatus ? <span className="muted">{modelStatus}</span> : null}
                </div>
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>{t('webControl.promptConsole')}</strong>
                </div>
                <textarea
                  value={promptDraft}
                  onChange={event => setPromptDraft(event.target.value)}
                  placeholder={t('webControl.promptPlaceholder')}
                  style={{ minHeight: 140 }}
                />
                <div className="row">
                  <button className="primary" onClick={() => void handleSendPrompt()} disabled={!promptDraft.trim()}>
                    {t('webControl.sendPrompt')}
                  </button>
                </div>
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>{t('webControl.latestResponse')}</strong>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', minHeight: 180 }}>{responseText || t('webControl.noResponse')}</pre>
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>{t('webControl.supportMatrix')}</strong>
                </div>
                {!selectedMatrix ? (
                  <p className="muted">{t('common.loading')}</p>
                ) : (
                  <>
                    <div className="form-grid">
                      <label>
                        <span>{t('webControl.capabilityPrompt')}</span>
                        <input value={selectedMatrix.supportsPromptInput ? t('webControl.yes') : t('webControl.no')} readOnly />
                      </label>
                      <label>
                        <span>{t('webControl.capabilityResponse')}</span>
                        <input value={selectedMatrix.supportsResponseRead ? t('webControl.yes') : t('webControl.no')} readOnly />
                      </label>
                      <label>
                        <span>{t('webControl.capabilityModel')}</span>
                        <input value={selectedMatrix.supportsModelSelection ? t('webControl.yes') : t('webControl.no')} readOnly />
                      </label>
                    </div>
                    <label className="stack">
                      <span>{t('webControl.entryUrls')}</span>
                      <textarea value={selectedMatrix.supportedEntryUrls.join('\n')} readOnly style={{ minHeight: 88 }} />
                    </label>
                    <label className="stack">
                      <span>{t('webControl.notes')}</span>
                      <textarea value={selectedMatrix.notes.join('\n')} readOnly style={{ minHeight: 110 }} />
                    </label>
                  </>
                )}
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>{t('webControl.knownSessions')}</strong>
                </div>
                <div className="workflow-list">
                  {sessions.length === 0 ? (
                    <p className="muted">{t('webControl.noSessions')}</p>
                  ) : sessions.map(session => (
                    <div key={session.sessionId} className="workflow-list-item">
                      <strong>{session.providerName}</strong>
                      <span className="muted">{session.accountLabel || session.sessionId}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function groupWebNodes(nodes: AiNode[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>()
  for (const node of nodes) {
    const current = groups.get(node.provider)
    if (current) {
      current.nodes.push(node)
      continue
    }
    groups.set(node.provider, {
      providerId: node.provider,
      providerName: getProviderName(node.provider),
      nodes: [node],
    })
  }
  return Array.from(groups.values())
}

function mergeSessions(current: BrowserSessionRecord[], next: BrowserSessionRecord[]): BrowserSessionRecord[] {
  const nextMap = new Map(next.map(session => [session.sessionId, session]))
  const merged = [...current]
    .filter(session => !nextMap.has(session.sessionId))
    .concat(next)
  return merged.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
}

function getDefaultUrl(provider: string): string {
  const urls: Record<string, string> = {
    chatgpt: 'https://chatgpt.com/',
    gemini: 'https://gemini.google.com/app',
    aistudio: 'https://aistudio.google.com/prompts/new_chat',
    claude: 'https://claude.ai/new',
    grok: 'https://grok.com/',
  }
  return urls[provider] || 'https://chatgpt.com/'
}

function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    aistudio: 'AI Studio',
    claude: 'Claude',
    grok: 'Grok',
  }
  return names[provider] || provider
}

function getProviderMark(provider: string): string {
  const marks: Record<string, string> = {
    chatgpt: 'GPT',
    gemini: 'Gem',
    aistudio: 'AIS',
    claude: 'Cl',
    grok: 'G',
  }
  return marks[provider] || 'AI'
}
