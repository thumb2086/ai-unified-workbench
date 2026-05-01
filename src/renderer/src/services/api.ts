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

const DEFAULT_CHAT_COMPLETION_PATH = 'chat/completions'
const DEFAULT_MODELS_PATH = 'models'

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
    const content = await requestProviderCompletion(provider, messages)
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

  if (!provider.baseUrl?.trim()) {
    return { success: false, message: 'Missing API baseUrl' }
  }

  try {
    const response = await fetch(joinUrl(provider.baseUrl || '', DEFAULT_MODELS_PATH), {
      method: 'GET',
      headers: buildApiHeaders(provider),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      return { success: false, message: error.message || error.error || 'Connection failed' }
    }

    const data = await response.json()
    const models = Array.isArray(data.data) ? data.data.length : Array.isArray(data.models) ? data.models.length : 0
    return { success: true, message: `Connection ok. Models: ${models}` }
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

    const data = await invokeBrowserOpen({
      providerId,
      url,
      sessionId: session.sessionId,
      providerName: options?.providerName || providerId,
      forceNew: options?.forceNew,
    })

    if (data.error || !data.sessionId) {
      upsertBrowserSession({
        ...session,
        url,
        status: 'error',
        lastActiveAt: new Date().toISOString(),
        lastError: data.error || 'Failed to open browser session',
      })
      return { error: data.error || 'Failed to open browser session' }
    }

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
    const response = await invokeBrowserSend(sessionId, prompt)
    if (response.error) {
      return { error: response.error }
    }

    return { status: response.data?.status || 'sent' }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function readFromBrowser(sessionId: string): Promise<{ content?: string; status?: string; error?: string }> {
  try {
    const response = await invokeBrowserRead(sessionId)
    if (response.error) {
      return { error: response.error }
    }

    return response
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
    await invokeBrowserClose(sessionId)
  } finally {
    removeBrowserSession(sessionId)
  }
}

export async function clearBrowserSession(sessionId: string): Promise<void> {
  try {
    await invokeBrowserClear(sessionId)
  } finally {
    removeBrowserSession(sessionId)
  }
}

export async function closeAllBrowsers(): Promise<void> {
  try {
    await invokeBrowserCloseAll()
  } catch {
    // Intentionally ignore shutdown failures.
  }
}

async function invokeBrowserOpen(payload: { providerId: string; url: string; sessionId?: string; providerName?: string; forceNew?: boolean }): Promise<{ sessionId?: string; providerId?: string; url?: string; status?: string; error?: string }> {
  if (typeof window === 'undefined' || !window.aiWorkbench?.browserOpen) {
    return { error: 'Browser session API is unavailable' }
  }
  return window.aiWorkbench.browserOpen(payload)
}

async function invokeBrowserSend(sessionId: string, prompt: string): Promise<{ data?: { status?: string }; error?: string }> {
  if (typeof window === 'undefined' || !window.aiWorkbench?.browserSend) {
    return { error: 'Browser session API is unavailable' }
  }
  const result = await window.aiWorkbench.browserSend(sessionId, prompt)
  return result.success ? { data: { status: String(result.data && typeof result.data === 'object' ? (result.data as any).status || 'sent' : 'sent') } } : { error: result.error }
}

async function invokeBrowserRead(sessionId: string): Promise<{ content?: string; status?: string; error?: string }> {
  if (typeof window === 'undefined' || !window.aiWorkbench?.browserRead) {
    return { error: 'Browser session API is unavailable' }
  }
  return window.aiWorkbench.browserRead(sessionId)
}

async function invokeBrowserClose(sessionId: string): Promise<void> {
  if (typeof window === 'undefined' || !window.aiWorkbench?.browserClose) {
    throw new Error('Browser session API is unavailable')
  }
  const result = await window.aiWorkbench.browserClose(sessionId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to close browser session')
  }
}

async function invokeBrowserClear(sessionId: string): Promise<void> {
  if (typeof window === 'undefined' || !window.aiWorkbench?.browserClear) {
    throw new Error('Browser session API is unavailable')
  }
  const result = await window.aiWorkbench.browserClear(sessionId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to clear browser session')
  }
}

async function invokeBrowserCloseAll(): Promise<void> {
  if (typeof window === 'undefined' || !window.aiWorkbench?.browserCloseAll) {
    throw new Error('Browser session API is unavailable')
  }
  const result = await window.aiWorkbench.browserCloseAll()
  if (!result.success) {
    throw new Error(result.error || 'Failed to close browser sessions')
  }
}

async function requestProviderCompletion(provider: ProviderConfig, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
  const baseUrl = (provider.baseUrl || '').trim()
  if (!baseUrl) {
    throw new Error('Missing API baseUrl')
  }

  const apiFormat = provider.apiFormat || 'openai'
  const model = provider.model || defaultModelForProvider(provider)

  if (apiFormat === 'anthropic') {
    const response = await fetch(joinUrl(baseUrl, 'messages'), {
      method: 'POST',
      headers: buildApiHeaders(provider, {
        'anthropic-version': '2023-06-01',
      }),
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: messages
          .filter(message => message.role !== 'system')
          .map(message => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
          })),
      }),
    })

    if (!response.ok) {
      const error = await safeJson(response)
      throw new Error(error.error || error.message || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return extractResponseContent(data, apiFormat)
  }

  const response = await fetch(joinUrl(baseUrl, DEFAULT_CHAT_COMPLETION_PATH), {
    method: 'POST',
    headers: buildApiHeaders(provider),
    body: JSON.stringify({
      model,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await safeJson(response)
    throw new Error(error.error || error.message || `HTTP ${response.status}`)
  }

  const data = await response.json()
  return extractResponseContent(data, apiFormat)
}

function buildApiHeaders(provider: ProviderConfig, extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...normalizeHeaders(provider.headers),
    ...extraHeaders,
  }

  if (provider.apiKey) {
    if ((provider.apiFormat || 'openai') === 'anthropic') {
      headers['x-api-key'] = provider.apiKey
    } else {
      headers.Authorization = `Bearer ${provider.apiKey}`
    }
  }

  return headers
}

function normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {}
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]))
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`
}

function defaultModelForProvider(provider: ProviderConfig): string {
  if (provider.model) return provider.model
  if (provider.apiFormat === 'anthropic') return 'claude-3-5-sonnet-latest'
  return 'gpt-4o'
}

function extractResponseContent(data: any, apiFormat: string): string {
  if (!data) return ''
  if (typeof data.content === 'string') return data.content

  if (apiFormat === 'anthropic') {
    if (Array.isArray(data.content)) {
      return data.content.map((part: any) => part?.text || '').join('')
    }
    return String(data.content || '')
  }

  const choice = data.choices?.[0]
  if (choice?.message?.content) return String(choice.message.content)
  if (choice?.text) return String(choice.text)
  if (typeof data.response === 'string') return data.response
  return ''
}

function safeJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}))
}
