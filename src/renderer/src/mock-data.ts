export type Provider = 'OpenAI' | 'Gemini' | 'Claude' | 'Grok'

export const providers: Array<{ id: string; name: Provider; status: 'online' | 'offline'; note: string }> = [
  { id: 'openai', name: 'OpenAI', status: 'online', note: 'ChatGPT 網頁版' },
  { id: 'gemini', name: 'Gemini', status: 'online', note: 'Google Gemini 網頁版' },
  { id: 'claude', name: 'Claude', status: 'online', note: 'Anthropic Claude 網頁版' },
  { id: 'grok', name: 'Grok', status: 'offline', note: 'X Grok 網頁版' }
]

export const templates = [
  '比較模式：同題多 AI',
  '協作模式：分工寫作',
  '代理模式：拆解任務'
]

export const sampleResponses = [
  { ai: 'OpenAI', content: 'OpenAI：建議先確認範圍，再拆成多個可執行步驟。' },
  { ai: 'Gemini', content: 'Gemini：可以先做三欄式 UI，再接資料層。' },
  { ai: 'Claude', content: 'Claude：先把資訊架構與資料模型穩定下來會更好。' },
  { ai: 'Grok', content: 'Grok：可將任務拆解為比較、協作與代理三種流程。' }
]
