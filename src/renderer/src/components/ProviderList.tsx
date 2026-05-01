import { useState } from 'react'
import type { ProviderConfig } from '../types'

interface ProviderListProps {
  providers: ProviderConfig[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onOpenWebsite: (provider: ProviderConfig) => void
  onCopyUrl: (url: string) => void
  onEdit?: (provider: ProviderConfig) => void
}

export function ProviderList({ providers, selectedIds, onToggle, onOpenWebsite, onCopyUrl, onEdit }: ProviderListProps) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="provider-list-container">
      <div className="section-header">
        <h2>AI 清單</h2>
        <button onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? '完成' : '設定'}
        </button>
      </div>

      <div className="provider-list">
        {providers.map(provider => {
          const isSelected = selectedIds.includes(provider.id)
          const isWeb = provider.type === 'web'
          const isApi = provider.type === 'api'

          return (
            <div key={provider.id} className={`provider-card ${isSelected ? 'active' : ''}`}>
              <label className="provider-title">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(provider.id)}
                />
                <strong>{provider.name}</strong>
                <span className={`badge ${isWeb ? 'web' : 'api'}`}>
                  {isWeb ? '網頁' : isApi ? 'API' : provider.apiFormat}
                </span>
              </label>

              <div className="provider-actions">
                {isWeb && provider.webUrl && (
                  <>
                    <button onClick={() => onOpenWebsite(provider)}>開啟網站</button>
                    <button onClick={() => onCopyUrl(provider.webUrl!)}>複製連結</button>
                  </>
                )}
                {isApi && provider.baseUrl && (
                  <span className="api-endpoint">{provider.baseUrl}</span>
                )}
                {onEdit && (
                  <button onClick={() => onEdit(provider)}>編輯</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
