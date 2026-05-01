import { useEffect, useMemo } from 'react'
import { useWorkbench } from './useWorkbenchState'
import type { Language } from '../types/workbench'

interface Dict {
  [key: string]: string | Dict
}

const translations: Record<Language, Dict> = {
  zh: {
    app: {
      title: 'AI 統一工作台',
      nodes: 'AI 節點',
      workflow: '工作流藍圖',
      chat: '聊天 / 執行',
    },
    common: {
      add: '新增',
      selectAll: '全選',
      clearAll: '清空',
      save: '儲存',
      delete: '刪除',
      duplicate: '複製',
      rename: '重新命名',
      cancel: '取消',
      close: '關閉',
      enable: '啟用',
      disable: '停用',
      run: '執行',
      loading: '載入中',
      selected: '已選取',
      noSelection: '尚未選取',
    },
    nodes: {
      title: 'AI 節點',
      subtitle: '建立與管理所有 AI 節點設定',
      description: '描述',
      createWeb: '新增 Web 節點',
      createApi: '新增 API 節點',
      duplicate: '複製節點',
      provider: '供應商',
      kind: '類型',
      web: 'Web',
      api: 'API',
      session: 'Session',
      conversation: '對話上下文',
      endpoint: '端點',
      model: '模型',
      headers: 'Headers',
      webUrl: '網頁網址',
      apiKey: 'API Key',
      baseUrl: 'Base URL',
      apiFormat: 'API 格式',
    },
    workflow: {
      title: '工作流藍圖',
      subtitle: '將 AI 節點串成可執行的藍圖',
      create: '新增工作流',
      run: '執行工作流',
      autoLayout: '自動排版',
      inspector: '節點設定',
      connectHint: '先選取一個節點，再點另一個節點建立連線',
      addPrompt: '新增 Prompt',
      addAgent: '新增 Agent',
      addTool: '新增 Tool',
      addCondition: '新增 Condition',
      addMerge: '新增 Merge',
    },
    chat: {
      title: '聊天 / 執行',
      subtitle: '多個回應窗與工作流執行整合',
      broadcast: '廣播',
      relay: '接力',
      debate: '辯論',
      send: '送出',
      reset: '重置',
      selectWorkflow: '選擇工作流',
      selectProviders: '選擇 AI 節點',
      responsePanels: '回應窗',
      workflowRun: '工作流結果',
      prompt: '輸入提示詞',
      topic: '辯論主題',
    },
    lang: {
      zh: '繁中',
      en: 'English',
    },
  },
  en: {
    app: {
      title: 'AI Unified Workbench',
      nodes: 'AI Nodes',
      workflow: 'Workflow Blueprint',
      chat: 'Chat / Run',
    },
    common: {
      add: 'Add',
      selectAll: 'Select all',
      clearAll: 'Clear all',
      save: 'Save',
      delete: 'Delete',
      duplicate: 'Duplicate',
      rename: 'Rename',
      cancel: 'Cancel',
      close: 'Close',
      enable: 'Enable',
      disable: 'Disable',
      run: 'Run',
      loading: 'Loading',
      selected: 'Selected',
      noSelection: 'Nothing selected',
    },
    nodes: {
      title: 'AI Nodes',
      subtitle: 'Create and manage all AI node settings',
      description: 'Description',
      createWeb: 'New Web Node',
      createApi: 'New API Node',
      duplicate: 'Duplicate Node',
      provider: 'Provider',
      kind: 'Type',
      web: 'Web',
      api: 'API',
      session: 'Session',
      conversation: 'Conversation Context',
      endpoint: 'Endpoint',
      model: 'Model',
      headers: 'Headers',
      webUrl: 'Web URL',
      apiKey: 'API Key',
      baseUrl: 'Base URL',
      apiFormat: 'API Format',
    },
    workflow: {
      title: 'Workflow Blueprint',
      subtitle: 'Wire AI nodes into an executable blueprint',
      create: 'New Workflow',
      run: 'Run Workflow',
      autoLayout: 'Auto Layout',
      inspector: 'Node Settings',
      connectHint: 'Select one node, then another to create a connection',
      addPrompt: 'Add Prompt',
      addAgent: 'Add Agent',
      addTool: 'Add Tool',
      addCondition: 'Add Condition',
      addMerge: 'Add Merge',
    },
    chat: {
      title: 'Chat / Run',
      subtitle: 'Multiple response panels and workflow execution',
      broadcast: 'Broadcast',
      relay: 'Relay',
      debate: 'Debate',
      send: 'Send',
      reset: 'Reset',
      selectWorkflow: 'Select workflow',
      selectProviders: 'Select AI nodes',
      responsePanels: 'Response panels',
      workflowRun: 'Workflow output',
      prompt: 'Enter prompt',
      topic: 'Debate topic',
    },
    lang: {
      zh: '繁中',
      en: 'English',
    },
  },
}

export function useI18n() {
  const { language, setLanguage } = useWorkbench()

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const t = useMemo(() => {
    const resolve = (key: string): string => {
      const parts = key.split('.')
      let current: Dict | string = translations[language]
      for (const part of parts) {
        if (typeof current === 'string') return current
        current = current[part] ?? key
      }
      return typeof current === 'string' ? current : key
    }
    return resolve
  }, [language])

  return {
    lang: language,
    setLang: setLanguage,
    t,
  }
}
