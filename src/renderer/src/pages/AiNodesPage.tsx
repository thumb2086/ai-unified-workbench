import { useEffect, useMemo, useState } from 'react'
import { useWorkbench } from '../hooks/useWorkbenchState'
import { useI18n } from '../hooks/useI18n'
import type { AiNode } from '../types/workbench'
import { closeBrowserSession, openBrowser } from '../services/api'
import { BrowserSessionRecord, loadBrowserSessions } from '../services/browser-session-store'

const PROVIDER_OPTIONS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
  { value: 'grok', label: 'Grok' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: '自訂' },
]

const API_FORMAT_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'nvidia-nim', label: 'NVIDIA NIM' },
  { value: 'custom', label: '自訂' },
]

export function AiNodesPage() {
  const { t } = useI18n()
  const {
    aiNodes,
    activeAiNodeId,
    setActiveAiNodeId,
    addAiNode,
    updateAiNode,
    deleteAiNode,
    duplicateAiNode,
  } = useWorkbench()

  const activeNode = useMemo(
    () => aiNodes.find(node => node.id === activeAiNodeId) ?? aiNodes[0] ?? null,
    [aiNodes, activeAiNodeId],
  )
  const [headerText, setHeaderText] = useState('')
  const [sessions, setSessions] = useState<BrowserSessionRecord[]>(() => loadBrowserSessions())

  useEffect(() => {
    if (!activeNode) return
    setActiveAiNodeId(activeNode.id)
    setHeaderText(stringifyHeaders(activeNode.headers))
  }, [activeNode, setActiveAiNodeId])

  useEffect(() => {
    setSessions(loadBrowserSessions())
  }, [activeNode?.id, activeNode?.sessionId])

  const handleUpdate = (patch: Partial<AiNode>) => {
    if (!activeNode) return
    updateAiNode(activeNode.id, current => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }))
  }

  const handleHeaderBlur = () => {
    if (!activeNode) return
    const parsed = parseHeaders(headerText)
    if (parsed) {
      handleUpdate({ headers: parsed })
    }
  }

  const handleOpenWeb = async (fresh = false) => {
    if (!activeNode || activeNode.kind !== 'web') return
    const url = activeNode.webUrl || 'https://chatgpt.com/'
    const result = await openBrowser(activeNode.provider, url, {
      providerName: activeNode.name,
      sessionId: fresh ? undefined : activeNode.sessionId,
      accountLabel: activeNode.accountLabel,
      accountKey: activeNode.accountKey,
    })

    if (result.error) {
      window.alert(result.error)
      return
    }

    if (result.sessionId) {
      handleUpdate({
        sessionId: result.sessionId,
        webUrl: url,
      })
      setSessions(loadBrowserSessions())
    }
  }

  const handleOpenSession = async (session: BrowserSessionRecord) => {
    const result = await openBrowser(session.providerId, session.url, {
      providerName: session.providerName,
      sessionId: session.sessionId,
      accountLabel: session.accountLabel,
      accountKey: session.accountKey,
    })
    if (!result.error) {
      setSessions(loadBrowserSessions())
    }
  }

  const handleCloseSession = async (session: BrowserSessionRecord) => {
    await closeBrowserSession(session.sessionId)
    setSessions(loadBrowserSessions())
    if (activeNode?.sessionId === session.sessionId) {
      handleUpdate({ sessionId: undefined })
    }
  }

  const currentSessions = sessions.filter(session => session.providerId === activeNode?.provider)

  return (
    <div className="page-grid nodes-page">
      <aside className="panel sidebar-panel">
        <div className="panel-head">
          <div>
            <h2>{t('nodes.title')}</h2>
            <p className="muted">{t('nodes.subtitle')}</p>
          </div>
        </div>

        <div className="stack">
          <button className="primary" onClick={() => setActiveAiNodeId(addAiNode('web').id)}>
            {t('nodes.createWeb')}
          </button>
          <button onClick={() => setActiveAiNodeId(addAiNode('api').id)}>
            {t('nodes.createApi')}
          </button>
        </div>

        <div className="node-list">
          {aiNodes.map(node => (
            <button
              key={node.id}
              className={`node-list-item ${node.id === activeNode?.id ? 'active' : ''}`}
              onClick={() => setActiveAiNodeId(node.id)}
            >
              <span className="node-list-title">{node.name}</span>
              <span className="pill">{node.kind.toUpperCase()}</span>
              <span className={`status-dot ${getNodeStatusTone(node)}`} />
            </button>
          ))}
        </div>
      </aside>

      <section className="panel content-panel">
        {!activeNode ? (
          <div className="empty-state">
            <h3>{t('common.noSelection')}</h3>
            <p>{t('nodes.subtitle')}</p>
          </div>
        ) : (
          <>
            <div className="panel-head split">
              <div>
                <h2>{activeNode.name}</h2>
                <p className="muted">
                  類型：{activeNode.kind.toUpperCase()} · 供應商：{activeNode.provider}
                </p>
              </div>
              <div className="row">
                <button onClick={() => duplicateAiNode(activeNode.id)}>{t('common.duplicate')}</button>
                <button className="danger" onClick={() => deleteAiNode(activeNode.id)}>{t('common.delete')}</button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                <span>{t('common.rename')}</span>
                <input
                  value={activeNode.name}
                  onChange={event => handleUpdate({ name: event.target.value })}
                />
              </label>

              <label>
                <span>{t('common.type')}</span>
                <select
                  value={activeNode.kind}
                  onChange={event => handleUpdate({
                    kind: event.target.value as AiNode['kind'],
                    webUrl: event.target.value === 'web' ? activeNode.webUrl : undefined,
                    sessionId: event.target.value === 'web' ? activeNode.sessionId : undefined,
                    accountLabel: event.target.value === 'web' ? activeNode.accountLabel : undefined,
                    accountKey: event.target.value === 'web' ? activeNode.accountKey : undefined,
                    conversationKey: event.target.value === 'web' ? activeNode.conversationKey : undefined,
                    baseUrl: event.target.value === 'api' ? activeNode.baseUrl || 'https://api.openai.com/v1' : undefined,
                    apiFormat: event.target.value === 'api' ? activeNode.apiFormat || 'openai' : undefined,
                  })}
                >
                  <option value="web">{t('nodes.web')}</option>
                  <option value="api">{t('nodes.api')}</option>
                </select>
              </label>

              <label>
                <span>{t('nodes.provider')}</span>
                <select
                  value={activeNode.provider}
                  onChange={event => handleUpdate({ provider: event.target.value })}
                >
                  {PROVIDER_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>{t('common.status')}</span>
                <select
                  value={activeNode.enabled ? 'enabled' : 'disabled'}
                  onChange={event => handleUpdate({ enabled: event.target.value === 'enabled' })}
                >
                  <option value="enabled">{t('common.enable')}</option>
                  <option value="disabled">{t('common.disable')}</option>
                </select>
              </label>
            </div>

            <label className="stack">
              <span>{t('nodes.description')}</span>
              <textarea
                value={activeNode.description || ''}
                onChange={event => handleUpdate({ description: event.target.value })}
                placeholder={t('nodes.description')}
              />
            </label>

            {activeNode.kind === 'web' ? (
              <div className="card stack">
                <div className="section-title">Web · Web session</div>
                <p className="muted">{t('nodes.openWebHint')}</p>

                <div className="form-grid">
                  <label>
                    <span>帳號標籤</span>
                    <input
                      value={activeNode.accountLabel || ''}
                      onChange={event => handleUpdate({ accountLabel: event.target.value })}
                      placeholder="例如：工作帳號 / 個人帳號"
                    />
                  </label>
                  <label>
                    <span>帳號識別</span>
                    <input
                      value={activeNode.accountKey || ''}
                      onChange={event => handleUpdate({ accountKey: event.target.value })}
                      placeholder="例如：email 或帳號 id"
                    />
                  </label>
                </div>

                <div className="row">
                  <span className={`pill ${activeNode.sessionId ? 'done' : 'warning'}`}>
                    {activeNode.sessionId ? t('nodes.opened') : t('nodes.notOpened')}
                  </span>
                  <button className="primary" onClick={() => void handleOpenWeb()}>
                    {activeNode.sessionId ? t('nodes.reopenWeb') : t('nodes.openNow')}
                  </button>
                </div>

                <label>
                  <span>{t('nodes.webUrl')}</span>
                  <input
                    value={activeNode.webUrl || 'https://chatgpt.com/'}
                    onChange={event => handleUpdate({ webUrl: event.target.value })}
                    placeholder="https://chatgpt.com/"
                  />
                </label>
                <label>
                  <span>{t('nodes.session')}</span>
                  <input
                    value={activeNode.sessionId || ''}
                    onChange={event => handleUpdate({ sessionId: event.target.value })}
                    placeholder="session id"
                  />
                </label>
                <label>
                  <span>{t('nodes.conversation')}</span>
                  <input
                    value={activeNode.conversationKey || ''}
                    onChange={event => handleUpdate({ conversationKey: event.target.value })}
                    placeholder="conversation key"
                  />
                </label>

                <div className="stack">
                  <div className="section-title">Web 分頁管理</div>
                  <div className="row">
                    <button onClick={() => setSessions(loadBrowserSessions())}>重新整理</button>
                    <button className="primary" onClick={() => void handleOpenWeb(true)}>
                      新增分頁
                    </button>
                  </div>

                  <div className="session-list">
                    {currentSessions.length === 0 ? (
                      <div className="empty-state">
                        <p>目前沒有可用的 web 分頁</p>
                      </div>
                    ) : (
                      currentSessions.map(session => (
                        <div key={session.sessionId} className="session-card">
                          <div className="session-card-head">
                            <div>
                              <strong>{session.providerName}</strong>
                              <p className="muted">
                                {session.accountLabel || session.accountKey || '未命名帳號'}
                              </p>
                            </div>
                            <span className={`pill ${session.status}`}>{session.status}</span>
                          </div>
                          <p className="muted">{session.url}</p>
                          <div className="session-card-meta">
                            <span>{session.sessionId}</span>
                            <span>{formatTime(session.lastActiveAt)}</span>
                          </div>
                          <div className="row">
                            <button onClick={() => void handleOpenSession(session)}>切換分頁</button>
                            <button className="danger" onClick={() => void handleCloseSession(session)}>
                              關閉分頁
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card stack">
                <div className="section-title">{t('nodes.api')}</div>
                <div className="form-grid">
                  <label>
                    <span>{t('nodes.apiFormat')}</span>
                    <select
                      value={activeNode.apiFormat || 'openai'}
                      onChange={event => handleUpdate({ apiFormat: event.target.value as AiNode['apiFormat'] })}
                    >
                      {API_FORMAT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('nodes.model')}</span>
                    <input
                      value={activeNode.model || ''}
                      onChange={event => handleUpdate({ model: event.target.value })}
                      placeholder="gpt-4o"
                    />
                  </label>
                  <label>
                    <span>{t('nodes.baseUrl')}</span>
                    <input
                      value={activeNode.baseUrl || ''}
                      onChange={event => handleUpdate({ baseUrl: event.target.value })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>
                  <label>
                    <span>{t('nodes.apiKey')}</span>
                    <input
                      value={activeNode.apiKey || ''}
                      onChange={event => handleUpdate({ apiKey: event.target.value })}
                      placeholder="sk-..."
                    />
                  </label>
                </div>
                <label>
                  <span>{t('nodes.headers')}</span>
                  <textarea
                    value={headerText}
                    onChange={event => setHeaderText(event.target.value)}
                    onBlur={handleHeaderBlur}
                    placeholder='{"Authorization": "Bearer ..."}'
                  />
                </label>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function stringifyHeaders(headers?: Record<string, string>): string {
  if (!headers || Object.keys(headers).length === 0) return ''
  return JSON.stringify(headers, null, 2)
}

function parseHeaders(input: string): Record<string, string> | undefined {
  const value = input.trim()
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const headers: Record<string, string> = {}
    for (const [key, item] of Object.entries(parsed)) {
      headers[key] = String(item)
    }
    return headers
  } catch {
    return undefined
  }
}

function getNodeStatusTone(node: AiNode): 'ok' | 'warning' | 'off' {
  if (!node.enabled) return 'off'
  if (node.kind === 'web' && !node.sessionId) return 'warning'
  return 'ok'
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-Hant', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
