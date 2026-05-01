export type BrowserSessionStatus = 'loading' | 'ready' | 'error' | 'busy'

export interface BrowserSessionRecord {
  sessionId: string
  providerId: string
  providerName: string
  url: string
  status: BrowserSessionStatus
  createdAt: string
  lastActiveAt: string
  lastError?: string
  accountLabel?: string
  accountKey?: string
}

const STORAGE_KEY = 'ai-workbench.browser-sessions.v2'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

export function loadBrowserSessions(): BrowserSessionRecord[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as BrowserSessionRecord[]) : []
  } catch {
    return []
  }
}

export function saveBrowserSessions(sessions: BrowserSessionRecord[]): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function upsertBrowserSession(session: BrowserSessionRecord): BrowserSessionRecord[] {
  const sessions = loadBrowserSessions()
  const next = [
    session,
    ...sessions.filter(existing => existing.sessionId !== session.sessionId),
  ]
  saveBrowserSessions(next)
  return next
}

export function removeBrowserSession(sessionId: string): BrowserSessionRecord[] {
  const sessions = loadBrowserSessions()
  const next = sessions.filter(session => session.sessionId !== sessionId)
  saveBrowserSessions(next)
  return next
}

export function findBrowserSession(sessionId: string): BrowserSessionRecord | undefined {
  return loadBrowserSessions().find(session => session.sessionId === sessionId)
}

export function findBrowserSessionsByProvider(providerId: string): BrowserSessionRecord[] {
  return loadBrowserSessions()
    .filter(session => session.providerId === providerId)
    .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
}

export function getMostRecentBrowserSession(): BrowserSessionRecord | undefined {
  return loadBrowserSessions().sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))[0]
}

export function createBrowserSessionRecord(
  providerId: string,
  providerName: string,
  url: string,
  sessionId?: string,
  account?: { label?: string; key?: string },
): BrowserSessionRecord {
  const now = new Date().toISOString()
  return {
    sessionId: sessionId || `session_${providerId}_${Date.now()}`,
    providerId,
    providerName,
    url,
    status: 'loading',
    createdAt: now,
    lastActiveAt: now,
    accountLabel: account?.label?.trim() || undefined,
    accountKey: account?.key?.trim() || undefined,
  }
}
