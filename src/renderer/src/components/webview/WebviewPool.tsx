import { useEffect, useMemo, useState } from 'react'
import type { AiNode } from '../../types/workbench'
import { useWorkbench } from '../../hooks/useWorkbenchState'
import {
  BrowserSessionRecord,
  createBrowserSessionRecord,
  loadBrowserSessions,
  removeBrowserSession,
  saveBrowserSessions,
} from '../../services/browser-session-store'
import { clearBrowserSession, openBrowser } from '../../services/api'
import { SlotManager } from './SlotManager'
import { WebviewSlot as WebviewSlotComponent } from './WebviewSlot'
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
  const [slots, setSlots] = useState<BrowserSessionRecord[]>(() => loadBrowserSessions())
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(groups[0]?.providerId ?? null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [showManager, setShowManager] = useState(false)
  const [isOpeningNodeId, setIsOpeningNodeId] = useState<string | null>(null)

  useEffect(() => {
    saveBrowserSessions(slots)
  }, [slots])

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
    const activeNode = webNodes.find(node => node.id === activeAiNodeId)
    if (!activeNode) return
    setSelectedProviderId(activeNode.provider)
    setSelectedSlotId(activeNode.sessionId ?? null)
  }, [activeAiNodeId, webNodes])

  const selectedGroup = groups.find(group => group.providerId === selectedProviderId) ?? groups[0] ?? null
  const selectedNode = selectedGroup?.nodes.find(node => node.id === activeAiNodeId) ?? selectedGroup?.nodes[0] ?? null
  const selectedSlot = useMemo(
    () => slots.find(slot => slot.sessionId === selectedSlotId) || null,
    [slots, selectedSlotId],
  )

  const refreshSlots = () => setSlots(loadBrowserSessions())

  const openNodeSession = async (node: AiNode, forceNew = false) => {
    setActiveAiNodeId(node.id)
    setSelectedProviderId(node.provider)
    setIsOpeningNodeId(node.id)

    const url = node.webUrl || getDefaultUrl(node.provider)
    const session = createBrowserSessionRecord(
      node.provider,
      node.name,
      url,
      forceNew ? undefined : node.sessionId,
      {
        label: node.accountLabel,
        key: node.accountKey,
      },
    )

    setSlots(prev => [
      { ...session, status: 'loading' },
      ...prev.filter(slot => slot.sessionId !== session.sessionId),
    ])

    try {
      const result = await openBrowser(node.provider, url, {
        providerName: node.name,
        sessionId: forceNew ? undefined : session.sessionId,
        forceNew,
        accountLabel: node.accountLabel,
        accountKey: node.accountKey,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      const sessionId = result.sessionId || session.sessionId
      const next: BrowserSessionRecord = {
        ...session,
        sessionId,
        providerName: node.name,
        url,
        status: 'ready',
        lastError: undefined,
        lastActiveAt: new Date().toISOString(),
      }

      setSlots(prev => [
        next,
        ...prev.filter(slot => slot.sessionId !== session.sessionId && slot.sessionId !== sessionId),
      ])
      setSelectedSlotId(sessionId)
      updateAiNode(node.id, current => ({
        ...current,
        sessionId,
        webUrl: url,
        updatedAt: new Date().toISOString(),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open browser session'
      setSlots(prev =>
        prev.map(slot =>
          slot.sessionId === session.sessionId
            ? { ...slot, status: 'error', lastError: message, lastActiveAt: new Date().toISOString() }
            : slot,
        ),
      )
      window.alert(message)
    } finally {
      setIsOpeningNodeId(null)
      refreshSlots()
    }
  }

  const activateSlot = async (slot: BrowserSessionRecord) => {
    const node = webNodes.find(item => item.sessionId === slot.sessionId)
    if (node) {
      setActiveAiNodeId(node.id)
      setSelectedProviderId(node.provider)
    }

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
      accountLabel: slot.accountLabel,
      accountKey: slot.accountKey,
    })

    setSlots(prev =>
      prev.map(item =>
        item.sessionId === slot.sessionId
          ? {
              ...item,
              status: result.error ? 'error' : 'ready',
              lastError: result.error,
              lastActiveAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }

  const handleRemoveSlot = async (slot: BrowserSessionRecord) => {
    await clearBrowserSession(slot.sessionId)
    removeBrowserSession(slot.sessionId)
    setSlots(prev => prev.filter(item => item.sessionId !== slot.sessionId))
    webNodes
      .filter(node => node.sessionId === slot.sessionId)
      .forEach(node => {
        updateAiNode(node.id, current => ({
          ...current,
          sessionId: undefined,
          updatedAt: new Date().toISOString(),
        }))
      })
    if (selectedSlotId === slot.sessionId) {
      setSelectedSlotId(null)
    }
  }

  const handleRenameSlot = (slot: BrowserSessionRecord) => {
    const nextName = window.prompt('重新命名 session', slot.providerName)
    if (!nextName?.trim()) return

    setSlots(prev =>
      prev.map(item =>
        item.sessionId === slot.sessionId
          ? { ...item, providerName: nextName.trim(), lastActiveAt: new Date().toISOString() }
          : item,
      ),
    )
  }

  const createWebNode = () => {
    const node = addAiNode('web')
    setSelectedProviderId(node.provider)
    setActiveAiNodeId(node.id)
  }

  return (
    <div className="controlled-web-page">
      <div className="controlled-web-sidebar">
        <div>
          <h2>控制網頁</h2>
          <p className="muted">先選 AI 網頁群組，再切換底下的 Web 節點分頁。</p>
        </div>

        <button className="primary" onClick={createWebNode}>新增 Web 節點</button>

        <div className="provider-workspace-tabs" role="tablist" aria-label="Web providers">
          {groups.map(group => (
            <button
              key={group.providerId}
              className={`provider-workspace-tab ${group.providerId === selectedGroup?.providerId ? 'active' : ''}`}
              onClick={() => {
                setSelectedProviderId(group.providerId)
                setActiveAiNodeId(group.nodes[0]?.id ?? null)
              }}
            >
              <span className="provider-mark">{getFavicon(group.providerId)}</span>
              <span>
                <strong>{group.providerName}</strong>
                <small>{group.nodes.length} 個節點</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="controlled-web-main">
        {!selectedGroup || !selectedNode ? (
          <div className="empty-state">
            <p>尚未建立 Web 節點</p>
            <p>先新增一個 Web 節點，再開啟可控制的網頁 session。</p>
          </div>
        ) : (
          <>
            <div className="node-tab-strip">
              {selectedGroup.nodes.map(node => {
                const slot = slots.find(item => item.sessionId === node.sessionId)
                const status = slot?.status || (node.sessionId ? 'ready' : 'idle')
                return (
                  <button
                    key={node.id}
                    className={`node-subtab ${node.id === selectedNode.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveAiNodeId(node.id)
                      setSelectedSlotId(node.sessionId ?? null)
                    }}
                  >
                    <span>
                      <strong>{node.name}</strong>
                      <small>{node.accountLabel || node.accountKey || node.provider}</small>
                    </span>
                    <span className={`session-state ${status}`}>{getStatusLabel(status)}</span>
                  </button>
                )
              })}
              <button className="node-subtab add" onClick={createWebNode}>+</button>
            </div>

            <div className="controlled-web-toolbar">
              <div>
                <h3>{selectedNode.name}</h3>
                <p className="muted">
                  {selectedNode.accountLabel || selectedNode.accountKey || '尚未標記帳號'} · {selectedNode.webUrl || getDefaultUrl(selectedNode.provider)}
                </p>
              </div>
              <div className="row">
                <button onClick={() => setShowManager(true)}>管理 sessions</button>
                <button onClick={() => void openNodeSession(selectedNode, true)}>新增獨立 session</button>
                <button
                  className="primary"
                  disabled={isOpeningNodeId === selectedNode.id}
                  onClick={() => void openNodeSession(selectedNode)}
                >
                  {isOpeningNodeId === selectedNode.id ? '開啟中...' : selectedNode.sessionId ? '切回網頁' : '開啟網頁'}
                </button>
              </div>
            </div>

            <div className="controlled-web-content">
              {selectedSlot ? (
                <WebviewSlotComponent
                  slot={selectedSlot}
                  isSelected
                  onActivate={(slot) => void activateSlot(slot)}
                  onRefresh={(slot) => void activateSlot(slot)}
                  onRemove={(slot) => void handleRemoveSlot(slot)}
                  onClear={(slot) => void handleRemoveSlot(slot)}
                  onRename={(slot) => void handleRenameSlot(slot)}
                />
              ) : (
                <div className="empty-state">
                  <p>這個節點尚未開啟</p>
                  <p>按「開啟網頁」後，這裡會綁定並記住該節點的 session。</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showManager && (
        <SlotManager
          slots={slots}
          onClose={() => setShowManager(false)}
          onRemove={(slot) => void handleRemoveSlot(slot)}
          onRename={(slot) => void handleRenameSlot(slot)}
          onClearSession={(slot) => void handleRemoveSlot(slot)}
        />
      )}
    </div>
  )
}

function groupWebNodes(nodes: AiNode[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>()
  for (const node of nodes) {
    const existing = groups.get(node.provider)
    if (existing) {
      existing.nodes.push(node)
    } else {
      groups.set(node.provider, {
        providerId: node.provider,
        providerName: getProviderName(node.provider),
        nodes: [node],
      })
    }
  }
  return Array.from(groups.values())
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

function getFavicon(provider: string): string {
  const favicons: Record<string, string> = {
    chatgpt: 'GPT',
    gemini: 'Gem',
    claude: 'Cl',
    grok: 'G',
    default: 'AI',
  }

  return favicons[provider] || favicons.default
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return '已開啟'
    case 'loading':
      return '開啟中'
    case 'error':
      return '錯誤'
    case 'busy':
      return '忙碌'
    default:
      return '尚未開啟'
  }
}
