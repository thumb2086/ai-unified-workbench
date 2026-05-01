import { useEffect, useRef, useState } from 'react'
import type { BrowserSessionRecord, BrowserSessionStatus } from '../../services/browser-session-store'
import './WebviewSlot.css'

interface WebviewSlotProps {
  slot: BrowserSessionRecord
  isSelected: boolean
  onActivate: (slot: BrowserSessionRecord) => void
  onRefresh: (slot: BrowserSessionRecord) => void
  onRemove: (slot: BrowserSessionRecord) => void
  onClear: (slot: BrowserSessionRecord) => void
  onRename: (slot: BrowserSessionRecord) => void
  onStatusChange?: (slot: BrowserSessionRecord, patch: Partial<BrowserSessionRecord>) => void
}

type WebviewElement = HTMLElement & {
  reload?: () => void
  getWebContentsId?: () => number
}

export function WebviewSlot({
  slot,
  isSelected,
  onRefresh,
  onRemove,
  onClear,
  onRename,
  onStatusChange,
}: WebviewSlotProps) {
  const webviewRef = useRef<WebviewElement | null>(null)
  const [partition, setPartition] = useState('')
  const [error, setError] = useState<string | null>(slot.lastError || null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    onStatusChange?.(slot, { status: 'loading', lastError: undefined })

    window.aiWorkbench.createWebview({
      slotId: slot.sessionId,
      url: slot.url,
      name: slot.providerName,
    }).then(result => {
      if (cancelled) return
      if (!result.success) {
        const message = result.error || '無法建立內嵌網頁'
        setError(message)
        onStatusChange?.(slot, { status: 'error', lastError: message })
        return
      }
      setPartition(result.partition)
    }).catch((err: Error) => {
      if (cancelled) return
      const message = err.message || '無法建立內嵌網頁'
      setError(message)
      onStatusChange?.(slot, { status: 'error', lastError: message })
    })

    return () => {
      cancelled = true
    }
  }, [slot.sessionId])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview || !partition) return

    const register = () => {
      try {
        const webContentsId = webview.getWebContentsId?.()
        if (webContentsId) {
          void window.aiWorkbench.registerWebview(slot.sessionId, webContentsId)
        }
      } catch {
        // Registration can fail while Electron is still attaching the webview.
      }
    }

    const handleDomReady = () => {
      register()
      onStatusChange?.(slot, { status: 'ready', lastError: undefined })
    }
    const handleDidStartLoading = () => onStatusChange?.(slot, { status: 'loading' })
    const handleDidStopLoading = () => onStatusChange?.(slot, { status: 'ready', lastError: undefined })
    const handleDidFailLoad = (event: Event) => {
      const message = extractFailLoadMessage(event)
      setError(message)
      onStatusChange?.(slot, { status: 'error', lastError: message })
    }

    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('did-start-loading', handleDidStartLoading)
    webview.addEventListener('did-stop-loading', handleDidStopLoading)
    webview.addEventListener('did-fail-load', handleDidFailLoad)

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('did-start-loading', handleDidStartLoading)
      webview.removeEventListener('did-stop-loading', handleDidStopLoading)
      webview.removeEventListener('did-fail-load', handleDidFailLoad)
    }
  }, [onStatusChange, partition, slot])

  const status = (error ? 'error' : slot.status) as BrowserSessionStatus

  return (
    <div className={`webview-slot ${isSelected ? 'selected' : ''}`}>
      <div className="embedded-webview-toolbar">
        <div>
          <strong>{slot.providerName}</strong>
          <span>{slot.url}</span>
        </div>
        <div className="embedded-webview-actions">
          <span className={`session-status status-${status}`}>{statusLabel(status)}</span>
          <button onClick={() => webviewRef.current?.reload?.()}>重新整理</button>
          <button onClick={() => onRefresh(slot)}>重新掛載</button>
          <button onClick={() => onRename(slot)}>重新命名</button>
          <button onClick={() => onClear(slot)}>清除 session</button>
          <button className="danger" onClick={() => onRemove(slot)}>關閉</button>
        </div>
      </div>

      {error && (
        <div className="session-error">
          {error}
        </div>
      )}

      <div className="embedded-webview-frame">
        {partition ? (
          <webview
            ref={webviewRef as never}
            className="embedded-webview"
            src={slot.url}
            partition={partition}
            allowpopups
          />
        ) : (
          <div className="embedded-webview-loading">正在建立內嵌網頁...</div>
        )}
      </div>
    </div>
  )
}

function extractFailLoadMessage(event: Event): string {
  const detail = event as Event & { errorDescription?: string; errorCode?: number; validatedURL?: string }
  if (detail.errorDescription) return detail.errorDescription
  if (detail.errorCode) return `載入失敗 (${detail.errorCode})`
  return '網頁載入失敗'
}

function statusLabel(status: BrowserSessionStatus): string {
  switch (status) {
    case 'ready':
      return '已載入'
    case 'loading':
      return '載入中'
    case 'busy':
      return '忙碌'
    case 'error':
      return '錯誤'
    default:
      return status
  }
}
