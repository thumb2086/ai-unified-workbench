import { useMemo, useState } from 'react'
import { useWorkbench } from './hooks/useWorkbenchState'
import { useI18n } from './hooks/useI18n'
import { LanguageToggle } from './components/LanguageToggle'
import { AiNodesPage } from './pages/AiNodesPage'
import { WorkflowBlueprintPage } from './pages/WorkflowBlueprintPage'
import { ChatPanel } from './components/chat/ChatPanel'
import './App.css'

type Tab = 'nodes' | 'workflow' | 'chat'

function isElectron() {
  return typeof window !== 'undefined' && typeof window.aiWorkbench !== 'undefined'
}

export default function App() {
  const electronMode = isElectron()
  const { t } = useI18n()
  const { activeAiNodeId, activeWorkflowId, activeChatThreadId } = useWorkbench()
  const [activeTab, setActiveTab] = useState<Tab>('nodes')

  const subtitle = useMemo(() => {
    if (activeTab === 'nodes') return activeAiNodeId ? 'AI node selected' : t('nodes.subtitle')
    if (activeTab === 'workflow') return activeWorkflowId ? 'Workflow selected' : t('workflow.subtitle')
    return activeChatThreadId ? 'Chat thread selected' : t('chat.subtitle')
  }, [activeTab, activeAiNodeId, activeWorkflowId, activeChatThreadId, t])

  if (!electronMode) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">{t('app.title')}</div>
            <h1>{t('app.title')}</h1>
            <p className="subtitle">Please run with Electron for full functionality.</p>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">{t('app.title')}</div>
          <h1>{t('app.title')}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>

        <nav className="main-tabs">
          <button className={activeTab === 'nodes' ? 'active' : ''} onClick={() => setActiveTab('nodes')}>
            {t('app.nodes')}
          </button>
          <button className={activeTab === 'workflow' ? 'active' : ''} onClick={() => setActiveTab('workflow')}>
            {t('app.workflow')}
          </button>
          <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
            {t('app.chat')}
          </button>
        </nav>

        <div className="topbar-actions">
          <LanguageToggle />
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'nodes' && <AiNodesPage />}
        {activeTab === 'workflow' && <WorkflowBlueprintPage />}
        {activeTab === 'chat' && <ChatPanel />}
      </main>
    </div>
  )
}
