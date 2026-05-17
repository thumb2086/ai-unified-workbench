import { useEffect, useMemo, useState } from 'react'
import type { AiNode } from '../../types/workbench'
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
  listRemoteBrowserSessions,
  openBrowser,
  readFromBrowser,
  sendToBrowser,
} from '../../services/api'
import './WebviewPool.css'

type ProviderGroup = {
  providerId: string
  providerName: string
  nodes: AiNode[]
}

export function WebviewPool() {
  const { aiNodes, activeAiNodeId, setActiveAiNodeId, updateAiNode, addAiNode } = useWorkbench()
  const webNodes = useMemo(() => aiNodes.filter(node => node.kind === 'web'), [aiNodes])
  const groups = useMemo(() => groupWebNodes(webNodes), [webNodes])
  const [sessions, setSessions] = useState<BrowserSessionRecord[]>(() => loadBrowserSessions())
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(groups[0]?.providerId ?? null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(webNodes[0]?.id ?? null)
  const [promptDraft, setPromptDraft] = useState('')
  const [responseText, setResponseText] = useState('')
  const [busySessionId, setBusySessionId] = useState<string | null>(null)

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
  }, [])

  const selectedGroup = groups.find(group => group.providerId === selectedProviderId) ?? groups[0] ?? null
  const selectedNode = selectedGroup?.nodes.find(node => node.id === selectedNodeId) ?? selectedGroup?.nodes[0] ?? null
  const selectedSession = selectedNode?.sessionId ? sessions.find(item => item.sessionId === selectedNode.sessionId) ?? null : null

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

  const ensureSession = async (node: AiNode, forceNew = false) => {
    const url = node.webUrl || getDefaultUrl(node.provider)
    const result = await openBrowser(node.provider, url, {
      providerName: node.name,
      sessionId: forceNew ? undefined : node.sessionId,
      forceNew,
      accountLabel: node.accountLabel,
      accountKey: node.accountKey,
    })

    if (result.error || !result.sessionId) {
      window.alert(result.error || 'Failed to open browser session')
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
          <h2>Browser Control</h2>
          <p className="muted">Puppeteer-backed sessions open in a dedicated Chrome profile outside the app.</p>
        </div>

        <button className="primary" onClick={createWebNode}>Create Web Node</button>
        <button onClick={() => void refreshRemoteSessions()}>Refresh Sessions</button>

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
            <p>No web node selected.</p>
            <p>Create one to open a controlled browser session.</p>
          </div>
        ) : (
          <>
            <div className="node-tab-strip">
              {selectedGroup.nodes.map(node => {
                const session = node.sessionId ? sessions.find(item => item.sessionId === node.sessionId) : null
                const status = session?.status || 'loading'
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
                    <span className={`session-state ${status}`}>{status}</span>
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
                  {selectedNode.sessionId ? 'Focus Session' : 'Open Session'}
                </button>
                <button onClick={() => void handleOpenSession(true)}>New Session</button>
                <button onClick={() => void handleReadResponse()} disabled={!selectedNode.sessionId}>Read Response</button>
                <button onClick={() => void handleCloseSession()} disabled={!selectedNode.sessionId}>Close</button>
                <button className="danger" onClick={() => void handleClearSession()} disabled={!selectedNode.sessionId}>Clear Profile</button>
              </div>
            </div>

            <div className="controlled-web-content" style={{ display: 'grid', gap: 16 }}>
              <div className="card stack">
                <div className="panel-head">
                  <strong>Session Info</strong>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Session ID</span>
                    <input value={selectedNode.sessionId || ''} readOnly />
                  </label>
                  <label>
                    <span>Account Label</span>
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
                    <span>Account Key</span>
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
                </div>
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>Prompt Console</strong>
                </div>
                <textarea
                  value={promptDraft}
                  onChange={event => setPromptDraft(event.target.value)}
                  placeholder="Type a prompt to send through the controlled browser session."
                  style={{ minHeight: 140 }}
                />
                <div className="row">
                  <button className="primary" onClick={() => void handleSendPrompt()} disabled={!promptDraft.trim()}>
                    Send Prompt
                  </button>
                </div>
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>Latest Response</strong>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', minHeight: 180 }}>{responseText || 'No response captured yet.'}</pre>
              </div>

              <div className="card stack">
                <div className="panel-head">
                  <strong>Known Sessions</strong>
                </div>
                <div className="workflow-list">
                  {sessions.length === 0 ? (
                    <p className="muted">No browser sessions recorded yet.</p>
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
    claude: 'https://claude.ai/new',
    grok: 'https://grok.com/',
  }
  return urls[provider] || 'https://chatgpt.com/'
}

function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    claude: 'Claude',
    grok: 'Grok',
  }
  return names[provider] || provider
}

function getProviderMark(provider: string): string {
  const marks: Record<string, string> = {
    chatgpt: 'GPT',
    gemini: 'Gem',
    claude: 'Cl',
    grok: 'G',
  }
  return marks[provider] || 'AI'
}
