import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserSessionRecord,
  createBrowserSessionRecord,
  findBrowserSession,
  getMostRecentBrowserSession,
  loadBrowserSessions,
  removeBrowserSession,
  saveBrowserSessions,
  upsertBrowserSession,
} from '../../services/browser-session-store'
import { clearBrowserSession, openBrowser } from '../../services/api'
import { SlotManager } from './SlotManager'
import { WebviewSlot as WebviewSlotComponent } from './WebviewSlot'
import './WebviewPool.css'

const DEFAULT_PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
]

export function WebviewPool() {
  const [slots, setSlots] = useState<BrowserSessionRecord[]>(() => loadBrowserSessions())
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [showManager, setShowManager] = useState(false)
  const [showAddDropdown, setShowAddDropdown] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const autoOpenedRef = useRef(false)

  useEffect(() => {
    saveBrowserSessions(slots)
  }, [slots])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (autoOpenedRef.current || slots.length === 0) return
    const recent = getMostRecentBrowserSession()
    if (!recent) return

    autoOpenedRef.current = true
    void activateSlot(recent)
  }, [slots])

  const selectedSlot = useMemo(
    () => slots.find(slot => slot.sessionId === selectedSlotId) || null,
    [slots, selectedSlotId],
  )

  const handleAddSlot = async (providerId: string, customName?: string) => {
    const provider = DEFAULT_PROVIDERS.find(item => item.id === providerId)
    if (!provider) {
      alert(`Provider ${providerId} not found`)
      return
    }

    setIsAdding(true)
    setShowAddDropdown(false)

    const existing = findBrowserSession(providerId)
    const session = existing ?? createBrowserSessionRecord(
      providerId,
      customName || provider.name,
      provider.url,
    )

    try {
      const result = await openBrowser(providerId, provider.url, {
        providerName: customName || provider.name,
        sessionId: session.sessionId,
        forceNew: !existing,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      const next: BrowserSessionRecord = {
        ...session,
        sessionId: result.sessionId || session.sessionId,
        providerName: customName || provider.name,
        url: provider.url,
        status: 'ready',
        lastActiveAt: new Date().toISOString(),
      }

      setSlots(prev => {
        const filtered = prev.filter(item => item.sessionId !== session.sessionId)
        return [next, ...filtered]
      })
      setSelectedSlotId(next.sessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create browser session'
      setSlots(prev =>
        prev.map(item =>
        item.sessionId === session.sessionId
            ? { ...item, status: 'error', lastError: message, lastActiveAt: new Date().toISOString() }
            : item,
        ),
      )
      alert(message)
    } finally {
      setIsAdding(false)
    }
  }

  const activateSlot = async (slot: BrowserSessionRecord) => {
    setSelectedSlotId(slot.sessionId)
    setSlots(prev =>
      prev.map(item =>
        item.sessionId === slot.sessionId
          ? { ...item, status: 'loading', lastActiveAt: new Date().toISOString() }
          : item,
      ),
    )

    const result = await openBrowser(slot.providerId, slot.url, {
      providerName: slot.providerName,
      sessionId: slot.sessionId,
    })

    if (result.error) {
      setSlots(prev =>
        prev.map(item =>
          item.sessionId === slot.sessionId
            ? { ...item, status: 'error', lastError: result.error, lastActiveAt: new Date().toISOString() }
            : item,
        ),
      )
      return
    }

    setSlots(prev =>
      prev.map(item =>
        item.sessionId === slot.sessionId
          ? {
              ...item,
              sessionId: result.sessionId || item.sessionId,
              status: 'ready',
              lastError: undefined,
              lastActiveAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }

  const handleRefreshSlot = async (slot: BrowserSessionRecord) => {
    await activateSlot(slot)
  }

  const handleRemoveSlot = async (slot: BrowserSessionRecord) => {
    await clearBrowserSession(slot.sessionId)
    removeBrowserSession(slot.sessionId)
    setSlots(prev => prev.filter(item => item.sessionId !== slot.sessionId))
    if (selectedSlotId === slot.sessionId) {
      setSelectedSlotId(null)
    }
  }

  const handleClearSession = async (slot: BrowserSessionRecord) => {
    await clearBrowserSession(slot.sessionId)
    const provider = DEFAULT_PROVIDERS.find(item => item.id === slot.providerId)
    if (provider) {
      const resetSlot: BrowserSessionRecord = {
        ...createBrowserSessionRecord(slot.providerId, slot.providerName, provider.url, slot.sessionId),
        status: 'loading',
      }

      setSlots(prev =>
        prev.map(item =>
          item.sessionId === slot.sessionId ? resetSlot : item,
        ),
      )
    }
  }

  const handleRenameSlot = (slot: BrowserSessionRecord) => {
    const nextName = window.prompt('新的分頁名稱', slot.providerName)
    if (!nextName?.trim()) return

    setSlots(prev =>
      prev.map(item =>
        item.sessionId === slot.sessionId
          ? { ...item, providerName: nextName.trim(), lastActiveAt: new Date().toISOString() }
          : item,
      ),
    )
  }

  return (
    <div className="webview-pool chrome-style">
      <div className="tab-bar">
        <div className="tabs-container">
          {slots.map(slot => (
            <div
              key={slot.sessionId}
              className={`tab ${selectedSlotId === slot.sessionId ? 'active' : ''}`}
              onClick={() => void activateSlot(slot)}
            >
              <span className="tab-favicon">{getFavicon(slot.providerId)}</span>
              <span className="tab-title">{slot.providerName}</span>
              <span className={`tab-status status-${slot.status}`}></span>
              <button
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation()
                  void handleRemoveSlot(slot)
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          ))}

          <div className="add-dropdown tab-add" ref={dropdownRef}>
            <button
              className="btn-add-tab"
              onClick={(event) => {
                event.stopPropagation()
                setShowAddDropdown(prev => !prev)
              }}
              disabled={isAdding}
              title="New AI Tab"
            >
              {isAdding ? '...' : '+'}
            </button>
            {showAddDropdown && (
              <div className="dropdown-menu show" onClick={(event) => event.stopPropagation()}>
                {DEFAULT_PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      void handleAddSlot(provider.id)
                    }}
                  >
                    <span className="provider-icon">{getFavicon(provider.id)}</span>
                    <span className="provider-name">{provider.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="window-controls">
          <button onClick={() => setShowManager(true)} className="btn-manage" title="Manage Tabs">
            ☰
          </button>
        </div>
      </div>

      <div className="tab-content">
        {slots.length === 0 ? (
          <div className="empty-state">
            <p>No AI sessions open</p>
            <p>Click + to restore or create a browser session</p>
          </div>
        ) : selectedSlot ? (
          <WebviewSlotComponent
            slot={selectedSlot}
            isSelected
            onActivate={(slot) => void activateSlot(slot)}
            onRefresh={(slot) => void handleRefreshSlot(slot)}
            onRemove={(slot) => void handleRemoveSlot(slot)}
            onClear={(slot) => void handleClearSession(slot)}
            onRename={(slot) => void handleRenameSlot(slot)}
          />
        ) : (
          <div className="empty-state">
            <p>Select a session to continue</p>
          </div>
        )}
      </div>

      {showManager && (
        <SlotManager
          slots={slots}
          onClose={() => setShowManager(false)}
          onRemove={(slot) => void handleRemoveSlot(slot)}
          onRename={(slot) => void handleRenameSlot(slot)}
          onClearSession={(slot) => void handleClearSession(slot)}
        />
      )}
    </div>
  )
}

function getFavicon(provider: string): string {
  const favicons: Record<string, string> = {
    chatgpt: '🤖',
    gemini: '✨',
    claude: '🪶',
    grok: '⚡',
    default: '🌐',
  }

  return favicons[provider] || favicons.default
}
