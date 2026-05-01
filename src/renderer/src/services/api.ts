import type { ProviderConfig } from '../types'
import {
  appendAssistantReply,
  buildConversationRequestMessages,
  resetConversation,
} from './api-context-store'
import {
  createBrowserSessionRecord,
  findBrowserSession,
  loadBrowserSessions,
  removeBrowserSession,
  upsertBrowserSession,
} from './browser-session-store'

const API_BASE_URL = 'http://localhost:3001'

export async function sendChatRequest(
  provider: ProviderConfig,
  prompt: string,
  options?: { conversationKey?: string; resetConversation?: boolean },
): Promise<{ content: string; error?: string }> {
  if (provider.type !== 'api') {
    return { content: '', error: 'This provider is not an API provider' }
  }

  const conversationKey = options?.conversationKey || provider.id

  try {
    if (options?.resetConversation) {
      resetConversation(conversationKey)
    }

    const messages = buildConversationRequestMessages(conversationKey, provider.id, prompt)

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        apiFormat: provider.apiFormat || 'openai',
        prompt,
        messages,
        headers: provider.headers,
      }),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      return { content: '', error: error.message || error.error || `HTTP ${response.status}` }
    }

    const data = await response.json()
    const content = data.content || ''
    appendAssistantReply(conversationKey, provider.id, content)
    return { content }
  } catch (err: any) {
    return { content: '', error: err.message || 'Request failed' }
  }
}

export async function testConnection(provider: ProviderConfig): Promise<{ success: boolean; message: string }> {
  if (provider.type !== 'api') {
    return { success: true, message: 'Web provider does not require API key validation' }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: provider.headers,
      }),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      return { success: false, message: error.message || error.error || 'Connection failed' }
    }

    const data = await response.json()
    return { success: true, message: `Connection ok. Models: ${data.models?.length || 0}` }
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' }
  }
}

export async function openBrowser(
  providerId: string,
  url: string,
  options?: { providerName?: string; sessionId?: string; forceNew?: boolean },
): Promise<{ sessionId?: string; error?: string }> {
  try {
    const existing = !options?.forceNew
      ? (options?.sessionId
        ? loadBrowserSessions().find(session => session.sessionId === options.sessionId)
        : findBrowserSession(providerId))
      : undefined

    const session = existing ?? createBrowserSessionRecord(
      providerId,
      options?.providerName || providerId,
      url,
      options?.sessionId,
    )

    upsertBrowserSession({
      ...session,
      url,
      status: 'loading',
      lastActiveAt: new Date().toISOString(),
    })

    const response = await fetch(`${API_BASE_URL}/browser/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId,
        url,
        sessionId: session.sessionId,
      }),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      upsertBrowserSession({
        ...session,
        url,
        status: 'error',
        lastActiveAt: new Date().toISOString(),
        lastError: error.message || error.error || `HTTP ${response.status}`,
      })
      return { error: error.message || error.error }
    }

    const data = await response.json()
    upsertBrowserSession({
      ...session,
      sessionId: data.sessionId || session.sessionId,
      url: data.url || url,
      status: 'ready',
      lastActiveAt: new Date().toISOString(),
    })

    return { sessionId: data.sessionId || session.sessionId }
  } catch (err: any) {
    const fallbackSession = options?.sessionId
      ? loadBrowserSessions().find(session => session.sessionId === options.sessionId)
      : findBrowserSession(providerId)

    if (fallbackSession) {
      upsertBrowserSession({
        ...fallbackSession,
        status: 'error',
        lastError: err.message,
        lastActiveAt: new Date().toISOString(),
      })
    }

    return { error: err.message }
  }
}

export async function sendToBrowser(sessionId: string, prompt: string): Promise<{ status?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/browser/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, prompt }),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      return { error: error.message || error.error }
    }

    const data = await response.json()
    return { status: data.status }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function readFromBrowser(sessionId: string): Promise<{ content?: string; status?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/browser/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      return { error: error.message || error.error }
    }

    return await response.json()
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function broadcastToWeb(
  providerIds: string[],
  prompt: string,
  getProviderUrl: (id: string) => string | undefined,
): Promise<{
  results: Array<{
    providerId: string
    sessionId?: string
    error?: string
    sendStatus?: string
  }>
}> {
  const results: Array<{
    providerId: string
    sessionId?: string
    error?: string
    sendStatus?: string
  }> = []

  for (const providerId of providerIds) {
    const url = getProviderUrl(providerId)
    if (!url) {
      results.push({ providerId, error: 'Missing provider url' })
      continue
    }

    const openResult = await openBrowser(providerId, url)
    if (openResult.error || !openResult.sessionId) {
      results.push({ providerId, error: openResult.error || 'Failed to open browser session' })
      continue
    }

    await new Promise(resolve => setTimeout(resolve, 1000))

    const sendResult = await sendToBrowser(openResult.sessionId, prompt)
    results.push({
      providerId,
      sessionId: openResult.sessionId,
      sendStatus: sendResult.status,
      error: sendResult.error,
    })
  }

  return { results }
}

export async function readAllFromBrowsers(
  sessions: Array<{ providerId: string; sessionId: string }>,
): Promise<Array<{
  providerId: string
  content?: string
  status?: string
  error?: string
}>> {
  const results: Array<{
    providerId: string
    content?: string
    status?: string
    error?: string
  }> = []

  for (const { providerId, sessionId } of sessions) {
    try {
      const result = await readFromBrowser(sessionId)
      results.push({
        providerId,
        content: result.content,
        status: result.status,
        error: result.error,
      })
    } catch (err: any) {
      results.push({ providerId, error: err.message })
    }
  }

  return results
}

export async function closeBrowserSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/browser/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  } finally {
    removeBrowserSession(sessionId)
  }
}

export async function clearBrowserSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/browser/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  } finally {
    removeBrowserSession(sessionId)
  }
}

export async function closeAllBrowsers(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/browser/close-all`, { method: 'POST' })
  } catch {
    // Intentionally ignore shutdown failures.
  }
}

function safeJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}))
}
