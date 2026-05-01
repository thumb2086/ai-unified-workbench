import type { BrowserSessionRecord } from '../../services/browser-session-store'
import './SlotManager.css'

interface SlotManagerProps {
  slots: BrowserSessionRecord[]
  onClose: () => void
  onRemove: (slot: BrowserSessionRecord) => void
  onRename: (slot: BrowserSessionRecord) => void
  onClearSession: (slot: BrowserSessionRecord) => void
}

export function SlotManager({ slots, onClose, onRemove, onRename, onClearSession }: SlotManagerProps) {
  return (
    <div className="slot-manager-overlay" onClick={onClose}>
      <div className="slot-manager-modal" onClick={event => event.stopPropagation()}>
        <div className="slot-manager-header">
          <h3>Browser Sessions</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="slot-manager-content">
          {slots.length === 0 ? (
            <p className="empty-message">目前沒有可用的 browser sessions</p>
          ) : (
            <ul className="slot-list">
              {slots.map(slot => (
                <li key={slot.sessionId} className="slot-item">
                  <div className="slot-info">
                    <span className="slot-name-display">{slot.providerName}</span>
                    <span className="slot-provider">{slot.providerId}</span>
                    <span className={`slot-status-badge status-${slot.status}`}>{slot.status}</span>
                  </div>

                  <div className="slot-actions">
                    <button onClick={() => onRename(slot)}>重新命名</button>
                    <button onClick={() => onClearSession(slot)}>清除 Session</button>
                    <button className="btn-danger" onClick={() => onRemove(slot)}>關閉</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="slot-manager-footer">
          <p>共 {slots.length} 個 sessions</p>
          <button onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}
