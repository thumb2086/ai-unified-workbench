import type { BrowserSessionRecord } from '../../services/browser-session-store'
import './WebviewSlot.css'

interface WebviewSlotProps {
  slot: BrowserSessionRecord
  isSelected: boolean
  onActivate: (slot: BrowserSessionRecord) => void
  onRefresh: (slot: BrowserSessionRecord) => void
  onRemove: (slot: BrowserSessionRecord) => void
  onClear: (slot: BrowserSessionRecord) => void
  onRename: (slot: BrowserSessionRecord) => void
}

export function WebviewSlot({
  slot,
  isSelected,
  onActivate,
  onRefresh,
  onRemove,
  onClear,
  onRename,
}: WebviewSlotProps) {
  return (
    <div className={`webview-slot ${isSelected ? 'selected' : ''}`}>
      <div className="webview-session-card">
        <div className="session-head">
          <div>
            <h3>{slot.providerName}</h3>
            <p>{slot.url}</p>
          </div>
          <span className={`session-status status-${slot.status}`}>{slot.status}</span>
        </div>

        <div className="session-meta">
          <span>Session: {slot.sessionId}</span>
          <span>Updated: {formatDate(slot.lastActiveAt)}</span>
          <span>Created: {formatDate(slot.createdAt)}</span>
        </div>

        {slot.lastError && (
          <div className="session-error">
            {slot.lastError}
          </div>
        )}

        <div className="session-actions">
          <button onClick={() => onActivate(slot)}>開啟 / 切換</button>
          <button onClick={() => onRefresh(slot)}>重新載入</button>
          <button onClick={() => onRename(slot)}>重新命名</button>
          <button onClick={() => onClear(slot)}>清除 session</button>
          <button className="danger" onClick={() => onRemove(slot)}>關閉</button>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-Hant', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
