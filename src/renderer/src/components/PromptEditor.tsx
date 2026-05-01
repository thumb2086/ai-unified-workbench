import type { Mode, ProviderConfig } from '../types'

const MODES: { id: Mode; label: string }[] = [
  { id: 'compare', label: '比較模式' },
  { id: 'collaborate', label: '協作模式' },
  { id: 'agent', label: '代理模式' },
]

interface PromptEditorProps {
  title: string
  prompt: string
  mode: Mode
  selectedProviders: ProviderConfig[]
  onTitleChange: (title: string) => void
  onPromptChange: (prompt: string) => void
  onModeChange: (mode: Mode) => void
  onCopy: () => void
  onSubmit: () => void
  onBroadcast?: (providerIds: string[]) => void
}

export function PromptEditor({
  title,
  prompt,
  mode,
  selectedProviders,
  onTitleChange,
  onPromptChange,
  onModeChange,
  onCopy,
  onSubmit,
  onBroadcast,
}: PromptEditorProps) {
  const webProviders = selectedProviders.filter(p => p.type === 'web')
  const apiProviders = selectedProviders.filter(p => p.type === 'api')

  const handleBroadcast = () => {
    if (onBroadcast && webProviders.length > 0) {
      onBroadcast(webProviders.map(p => p.id))
    }
  }

  return (
    <div className="prompt-editor">
      <div className="editor-header">
        <h2>任務編排</h2>
        <div className="mode-selector">
          {MODES.map(m => (
            <button
              key={m.id}
              className={mode === m.id ? 'active' : ''}
              onClick={() => onModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>任務標題</label>
        <input
          type="text"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="輸入任務標題..."
        />
      </div>

      <div className="form-group">
        <label>統一提示詞</label>
        <textarea
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder="輸入要交給多個 AI 的問題或任務..."
          rows={8}
        />
      </div>

      <div className="editor-actions">
        <button onClick={onCopy}>複製提示詞</button>
        <button className="primary" onClick={onSubmit}>
          建立任務
        </button>
      </div>

      {(webProviders.length > 0 || apiProviders.length > 0) && (
        <div className="broadcast-section" style={{ 
          marginTop: '1.25rem', 
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            快速分發 ({webProviders.length} 網頁 / {apiProviders.length} API)
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {webProviders.length > 0 && (
              <button className="accent" onClick={handleBroadcast}>
                分發到網頁版 ({webProviders.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
