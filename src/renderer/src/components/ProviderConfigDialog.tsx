import { useState, useEffect } from 'react'
import type { ProviderConfig, ApiFormat, ProviderType } from '../types'
import { uid } from '../utils/helpers'

interface ProviderConfigDialogProps {
  provider?: ProviderConfig | null
  isOpen: boolean
  onClose: () => void
  onSave: (provider: ProviderConfig) => void
  onDelete?: (id: string) => void
}

const API_FORMATS: { id: ApiFormat; label: string }[] = [
  { id: 'openai', label: 'OpenAI 格式' },
  { id: 'nvidia-nim', label: 'NVIDIA NIM' },
  { id: 'anthropic', label: 'Anthropic (Claude)' },
  { id: 'custom', label: '自訂格式' },
]

const DEFAULT_PROVIDERS: Omit<ProviderConfig, 'id'>[] = [
  { name: 'ChatGPT', type: 'web', webUrl: 'https://chatgpt.com/' },
  { name: 'Gemini', type: 'web', webUrl: 'https://gemini.google.com/app' },
  { name: 'Claude', type: 'web', webUrl: 'https://claude.ai/new' },
  { name: 'Grok', type: 'web', webUrl: 'https://grok.com/' },
  { name: 'OpenAI', type: 'api', apiFormat: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { name: 'OpenRouter', type: 'api', apiFormat: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
  { name: 'NVIDIA NIM', type: 'api', apiFormat: 'nvidia-nim', baseUrl: '', model: '' },
]

export function ProviderConfigDialog({ provider, isOpen, onClose, onSave, onDelete }: ProviderConfigDialogProps) {
  const [form, setForm] = useState<Partial<ProviderConfig>>({
    type: 'api',
    apiFormat: 'openai',
  })

  useEffect(() => {
    if (provider) {
      setForm(provider)
    } else {
      setForm({ type: 'api', apiFormat: 'openai' })
    }
  }, [provider, isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return

    const config: ProviderConfig = {
      id: provider?.id ?? uid('provider'),
      name: form.name,
      type: form.type!,
      apiFormat: form.apiFormat,
      apiKey: form.apiKey,
      baseUrl: form.baseUrl,
      model: form.model,
      headers: form.headers,
      webUrl: form.webUrl,
    }
    onSave(config)
    onClose()
  }

  const loadPreset = (preset: Omit<ProviderConfig, 'id'>) => {
    setForm({ ...preset })
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3>{provider ? '編輯 Provider' : '新增 Provider'}</h3>

        {!provider && (
          <div className="preset-buttons">
            <span>快速選擇：</span>
            {DEFAULT_PROVIDERS.map(p => (
              <button key={p.name} onClick={() => loadPreset(p)}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>名稱 *</label>
            <input
              value={form.name ?? ''}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：OpenAI、ChatGPT"
              required
            />
          </div>

          <div className="form-group">
            <label>類型</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  checked={form.type === 'web'}
                  onChange={() => setForm(prev => ({ ...prev, type: 'web' }))}
                />
                網頁版
              </label>
              <label>
                <input
                  type="radio"
                  checked={form.type === 'api'}
                  onChange={() => setForm(prev => ({ ...prev, type: 'api' }))}
                />
                API
              </label>
            </div>
          </div>

          {form.type === 'web' && (
            <div className="form-group">
              <label>網站網址</label>
              <input
                value={form.webUrl ?? ''}
                onChange={e => setForm(prev => ({ ...prev, webUrl: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          )}

          {form.type === 'api' && (
            <>
              <div className="form-group">
                <label>API 格式</label>
                <select
                  value={form.apiFormat ?? 'openai'}
                  onChange={e => setForm(prev => ({ ...prev, apiFormat: e.target.value as ApiFormat }))}
                >
                  {API_FORMATS.map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>API 網址 *</label>
                <input
                  value={form.baseUrl ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  required
                />
              </div>

              <div className="form-group">
                <label>模型名稱 *</label>
                <input
                  value={form.model ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="gpt-4o"
                  required
                />
              </div>

              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={form.apiKey ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-..."
                />
              </div>

              <div className="form-group">
                <label>額外 Headers（JSON）</label>
                <textarea
                  value={form.headers ? JSON.stringify(form.headers, null, 2) : ''}
                  onChange={e => {
                    try {
                      const headers = e.target.value ? JSON.parse(e.target.value) : undefined
                      setForm(prev => ({ ...prev, headers }))
                    } catch {
                      // 無效 JSON 時不更新
                    }
                  }}
                  placeholder='{ "X-Custom-Header": "value" }'
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="dialog-actions">
            {provider && onDelete && (
              <button type="button" className="danger" onClick={() => { onDelete(provider.id); onClose() }}>
                刪除
              </button>
            )}
            <button type="button" onClick={onClose}>取消</button>
            <button type="submit" className="primary">儲存</button>
          </div>
        </form>
      </div>
    </div>
  )
}
