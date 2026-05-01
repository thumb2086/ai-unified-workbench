export type ApiRole = 'system' | 'user' | 'assistant'

export interface ApiMessage {
  role: ApiRole
  content: string
  timestamp: string
}

export interface ApiConversationRecord {
  conversationKey: string
  providerId: string
  messages: ApiMessage[]
  updatedAt: string
}

const STORAGE_KEY = 'ai-workbench.api-conversations.v1'
const MAX_MESSAGES = 24

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function loadAll(): ApiConversationRecord[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ApiConversationRecord[]) : []
  } catch {
    return []
  }
}

function saveAll(records: ApiConversationRecord[]): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function loadConversation(conversationKey: string): ApiConversationRecord | undefined {
  return loadAll().find(record => record.conversationKey === conversationKey)
}

export function saveConversation(record: ApiConversationRecord): void {
  const records = loadAll().filter(existing => existing.conversationKey !== record.conversationKey)
  records.unshift(record)
  saveAll(records.slice(0, 20))
}

export function appendConversationMessage(
  conversationKey: string,
  providerId: string,
  message: Omit<ApiMessage, 'timestamp'>,
): ApiConversationRecord {
  const existing = loadConversation(conversationKey)
  const now = new Date().toISOString()
  const nextMessages = [...(existing?.messages || []), { ...message, timestamp: now }]
    .slice(-MAX_MESSAGES)

  const next: ApiConversationRecord = {
    conversationKey,
    providerId,
    messages: nextMessages,
    updatedAt: now,
  }

  saveConversation(next)
  return next
}

export function resetConversation(conversationKey: string): void {
  const records = loadAll().filter(record => record.conversationKey !== conversationKey)
  saveAll(records)
}

export function buildConversationRequestMessages(
  conversationKey: string,
  providerId: string,
  prompt: string,
): { role: ApiRole; content: string }[] {
  const existing = loadConversation(conversationKey)
  const baseMessages = existing?.messages || []
  const nextMessages = [...baseMessages, { role: 'user' as const, content: prompt, timestamp: new Date().toISOString() }]
    .slice(-MAX_MESSAGES)

  saveConversation({
    conversationKey,
    providerId,
    messages: nextMessages,
    updatedAt: new Date().toISOString(),
  })

  return nextMessages.map(({ role, content }) => ({ role, content }))
}

export function appendAssistantReply(
  conversationKey: string,
  providerId: string,
  content: string,
): ApiConversationRecord {
  return appendConversationMessage(conversationKey, providerId, { role: 'assistant', content })
}
