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
  const { aiNodes, workflows, chatThreads, activeAiNodeId, activeWorkflowId, activeChatThreadId } = useWorkbench()
  const [activeTab, setActiveTab] = useState<Tab>('nodes')

  const subtitle = useMemo(() => {
    if (activeTab === 'nodes') {
      const node = aiNodes.find(item => item.id === activeAiNodeId)
      return node ? `${t('app.selection')}${node.name}` : t('nodes.subtitle')
    }
    if (activeTab === 'workflow') {
      const workflow = workflows.find(item => item.id === activeWorkflowId)
      return workflow ? `${t('app.selection')}${workflow.name}` : t('workflow.subtitle')
    }
    const thread = chatThreads.find(item => item.id === activeChatThreadId)
    return thread ? `${t('app.selection')}${thread.topic || thread.id}` : t('chat.subtitle')
  }, [activeTab, aiNodes, workflows, chatThreads, activeAiNodeId, activeWorkflowId, activeChatThreadId, t])

  if (!electronMode) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">{t('app.title')}</div>
            <h1>{t('app.title')}</h1>
            <p className="subtitle">請在 Electron 桌面應用中使用此介面。</p>
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
