import { useState, useCallback } from 'react'
import type { Task, ProviderConfig } from '../types'
import { formatTime, buildSummary } from '../utils/helpers'
import { sendChatRequest, openBrowser, readFromBrowser } from '../services/api'

interface ResponsePanelProps {
  task: Task | null
  providers: ProviderConfig[]
  webSessions?: Array<{ providerId: string; sessionId: string }>
  broadcasting?: boolean
  onSaveResponse: (providerId: string, content: string) => void
  onOpenWebsite: (provider: ProviderConfig) => void
  onCopyPrompt: (prompt: string, providerName: string) => void
  onExport: () => void
  onReadFromWeb?: () => void
}

type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

interface ProviderStatus {
  status: RequestStatus
  content?: string
  error?: string
}

export function ResponsePanel({ 
  task, 
  providers, 
  webSessions = [], 
  broadcasting = false,
  onSaveResponse, 
  onOpenWebsite, 
  onCopyPrompt, 
  onExport,
  onReadFromWeb 
}: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState<'responses' | 'summary'>('responses')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loadingState, setLoadingState] = useState<Record<string, ProviderStatus>>({})
  const [autoMode, setAutoMode] = useState(false)
  const [readingFromWeb, setReadingFromWeb] = useState(false)

  const handleAutoFetch = useCallback(async (provider: ProviderConfig) => {
    if (!task) return

    setLoadingState(prev => ({ ...prev, [provider.id]: { status: 'loading' } }))

    if (provider.type === 'api') {
      const result = await sendChatRequest(provider, task.prompt, {
        conversationKey: `${task.id}:${provider.id}`,
      })
      
      if (result.error) {
        setLoadingState(prev => ({ ...prev, [provider.id]: { status: 'error', error: result.error } }))
      } else {
        setLoadingState(prev => ({ ...prev, [provider.id]: { status: 'success', content: result.content } }))
        setDrafts(prev => ({ ...prev, [provider.id]: result.content }))
        onSaveResponse(provider.id, result.content)
      }
    } else {
      // 網頁版：開啟瀏覽器並複製提示詞
      await openBrowser(provider.id, provider.webUrl || '', { providerName: provider.name })
      await navigator.clipboard.writeText(task.prompt)
      setLoadingState(prev => ({ ...prev, [provider.id]: { status: 'success', content: '已開啟瀏覽器，提示詞已複製到剪貼簿' } }))
    }
  }, [task, onSaveResponse])

  const handleFetchAll = useCallback(async () => {
    if (!task) return
    setAutoMode(true)
    
    const apiProviders = task.providerIds
      .map(id => providers.find(p => p.id === id))
      .filter((p): p is ProviderConfig => p?.type === 'api')
    
    for (const provider of apiProviders) {
      await handleAutoFetch(provider)
    }
    
    setAutoMode(false)
  }, [task, providers, handleAutoFetch])

  // 从特定网页版读取回覆
  const handleReadFromSession = useCallback(async (providerId: string, sessionId: string) => {
    if (!task) return
    
    setReadingFromWeb(true)
    const result = await readFromBrowser(sessionId)
    
    if (result.content) {
      setDrafts(prev => ({ ...prev, [providerId]: result.content! }))
      onSaveResponse(providerId, result.content!)
      setLoadingState(prev => ({ 
        ...prev, 
        [providerId]: { status: 'success', content: result.content! } 
      }))
    }
    
    setReadingFromWeb(false)
  }, [task, onSaveResponse])

  if (!task) {
    return (
      <div className="response-panel">
        <div className="empty-state">請先建立任務</div>
      </div>
    )
  }

  const providerMap = new Map(providers.map(p => [p.id, p]))
  const selectedProviders = task.providerIds.map(id => providerMap.get(id)).filter(Boolean) as ProviderConfig[]
  const apiProviders = selectedProviders.filter(p => p.type === 'api')

  const summary = buildSummary(task.responses, new Map(providers.map(p => [p.id, { name: p.name }])))

  return (
    <div className="response-panel">
      <div className="panel-header">
        <h2>回覆管理</h2>
        <div className="tab-buttons">
          <button className={activeTab === 'responses' ? 'active' : ''} onClick={() => setActiveTab('responses')}>
            回覆
          </button>
          <button className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>
            摘要
          </button>
          <button onClick={onExport}>匯出</button>
        </div>
      </div>

      {(apiProviders.length > 0 || webSessions.length > 0) && (
        <div className="auto-actions" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {apiProviders.length > 0 && (
            <button 
              className="primary" 
              onClick={handleFetchAll}
              disabled={autoMode}
            >
              {autoMode ? '自動獲取中...' : `一鍵獲取全部 API 回覆 (${apiProviders.length})`}
            </button>
          )}
          {webSessions.length > 0 && onReadFromWeb && (
            <button 
              className="accent" 
              onClick={onReadFromWeb}
              disabled={readingFromWeb}
            >
              {readingFromWeb ? '讀取中...' : `讀取全部網頁回覆 (${webSessions.length})`}
            </button>
          )}
          {broadcasting && (
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              正在分發到網頁版...
            </span>
          )}
        </div>
      )}

      {activeTab === 'responses' && (
        <div className="response-editors">
          {selectedProviders.map(provider => {
            const saved = task.responses.find(r => r.providerId === provider.id)
            const draftValue = drafts[provider.id] ?? saved?.content ?? ''
            const status = loadingState[provider.id]
            const isLoading = status?.status === 'loading'
            const isApi = provider.type === 'api'

            return (
              <div key={provider.id} className="response-card">
                <div className="response-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong>{provider.name}</strong>
                    <span className={`badge ${provider.type}`}>{isApi ? 'API' : '網頁'}</span>
                    {status?.status === 'success' && <span className="status-indicator">已獲取</span>}
                    {status?.status === 'error' && <span className="status-indicator error">失敗</span>}
                  </div>
                  <div className="header-actions">
                    {isApi ? (
                      <button 
                        className="accent"
                        onClick={() => handleAutoFetch(provider)}
                        disabled={isLoading}
                      >
                        {isLoading ? '獲取中...' : '自動獲取'}
                      </button>
                    ) : (
                      <>
                        <button onClick={() => onOpenWebsite(provider)}>開啟網站</button>
                        {/* 如果有活跃会话，显示读取按钮 */}
                        {(() => {
                          const session = webSessions.find(s => s.providerId === provider.id)
                          if (session) {
                            return (
                              <button 
                                className="accent"
                                onClick={() => handleReadFromSession(provider.id, session.sessionId)}
                                disabled={readingFromWeb}
                              >
                                {readingFromWeb ? '讀取中...' : '讀取回覆'}
                              </button>
                            )
                          }
                          return null
                        })()}
                      </>
                    )}
                    <button onClick={() => onCopyPrompt(task.prompt, provider.name)}>複製提示詞</button>
                  </div>
                </div>

                {status?.status === 'error' && (
                  <div style={{ 
                    color: 'var(--danger)', 
                    fontSize: '0.8125rem', 
                    marginBottom: '0.5rem',
                    padding: '0.5rem',
                    background: 'rgba(248, 81, 73, 0.1)',
                    borderRadius: '4px'
                  }}>
                    錯誤: {status.error}
                  </div>
                )}

                {isApi ? (
                  <div className={`response-content ${!draftValue ? 'empty' : ''}`}>
                    {draftValue || '點擊「自動獲取」從 API 獲取回覆...'}
                  </div>
                ) : (
                  <textarea
                    value={draftValue}
                    onChange={e => setDrafts(prev => ({ ...prev, [provider.id]: e.target.value }))}
                    placeholder={`貼上 ${provider.name} 的回覆...`}
                    rows={6}
                  />
                )}

                <div className="response-footer">
                  {saved && (
                    <span className="saved-time">已儲存：{formatTime(saved.updatedAt)}</span>
                  )}
                  {!isApi && (
                    <button
                      className="primary"
                      onClick={() => onSaveResponse(provider.id, draftValue)}
                    >
                      儲存回覆
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="summary-view">
          <div className="summary-box">
            <h3>摘要</h3>
            <pre>{summary}</pre>
          </div>

          <div className="saved-responses">
            <h3>已儲存回覆</h3>
            {task.responses.length === 0 ? (
              <p className="empty">尚未儲存任何回覆</p>
            ) : (
              task.responses.map(r => {
                const provider = providerMap.get(r.providerId)
                return (
                  <div key={r.providerId} className="mini-response">
                    <strong>{provider?.name ?? r.providerId}</strong>
                    <p>{r.content.slice(0, 200)}{r.content.length > 200 ? '...' : ''}</p>
                    <span className="time">{formatTime(r.updatedAt)}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
