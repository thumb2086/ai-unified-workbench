import { Router } from 'express'
import { chromium, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs/promises'
import * as path from 'path'

const router = Router()

interface BrowserSession {
  id: string
  providerId: string
  userDataDir: string
  context: BrowserContext
  page: Page
  createdAt: number
  updatedAt: number
  lastUrl: string
  lastPrompt?: string
}

interface BrowserSessionSummary {
  id: string
  providerId: string
  createdAt: number
  updatedAt: number
  lastUrl: string
  hasPrompt: boolean
}

const sessions = new Map<string, BrowserSession>()
const SESSION_ROOT = path.join(process.cwd(), '.browser-sessions')

const SITE_CONFIGS: Record<string, {
  inputSelector: string
  sendButtonSelector?: string
  responseSelector?: string
  sendKey?: string
  waitForResponse?: number
}> = {
  chatgpt: {
    inputSelector: '#prompt-textarea, textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [contenteditable="true"]',
    sendButtonSelector: 'button[data-testid="send-button"], button[aria-label*="Send"], button:has-text("Send")',
    responseSelector: '[data-message-author-role="assistant"]:last-child, .markdown:last-child',
    sendKey: 'Enter',
    waitForResponse: 3000,
  },
  gemini: {
    inputSelector: 'textarea[placeholder*="Enter"], textarea[placeholder*="輸入"], [contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Send"], button:has(> svg), button.send-button',
    responseSelector: '.response-content, .message-content, [data-testid="response"]',
    sendKey: 'Enter',
    waitForResponse: 3000,
  },
  claude: {
    inputSelector: 'textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [contenteditable="true"]',
    sendButtonSelector: 'button[type="submit"], button:has-text("Send"), button[aria-label*="Send"]',
    responseSelector: '.claude-message, .message-content, [data-testid="assistant-message"]',
    sendKey: 'Enter',
    waitForResponse: 4000,
  },
  grok: {
    inputSelector: 'textarea, [contenteditable="true"], input[type="text"]',
    sendButtonSelector: 'button[type="submit"], button:has-text("Send")',
    responseSelector: '.message-content, .response, [data-testid="response"]',
    sendKey: 'Enter',
    waitForResponse: 3000,
  },
}

router.post('/open', async (req, res) => {
  const { providerId, url, sessionId: requestedSessionId } = req.body

  if (!providerId || !url) {
    return res.status(400).json({ error: 'Missing providerId or url' })
  }

  const sessionId = requestedSessionId || `session_${providerId}_${Date.now()}`

  try {
    const session = await ensureSession(sessionId, providerId, url)
    await session.page.bringToFront().catch(() => undefined)
    await navigateIfNeeded(session, url)

    res.json({
      sessionId,
      providerId,
      url: session.lastUrl,
      status: 'opened',
    })
  } catch (error: any) {
    console.error('Browser open error:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/send', async (req, res) => {
  const { sessionId, prompt } = req.body

  const session = sessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  const config = SITE_CONFIGS[session.providerId]
  if (!config) {
    return res.status(400).json({ error: 'No automation config for this provider' })
  }

  try {
    const { page } = session
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)

    const inputElement = page.locator(config.inputSelector).first()
    await inputElement.waitFor({ state: 'visible', timeout: 7000 })

    await inputElement.fill('')
    await inputElement.fill(prompt)
    session.lastPrompt = prompt

    if (config.sendButtonSelector) {
      try {
        const sendButton = page.locator(config.sendButtonSelector).first()
        await sendButton.click({ timeout: 3000 })
      } catch {
        await inputElement.press(config.sendKey || 'Enter')
      }
    } else {
      await inputElement.press(config.sendKey || 'Enter')
    }

    session.updatedAt = Date.now()
    session.lastUrl = page.url()
    res.json({ status: 'sent', prompt })
  } catch (error: any) {
    console.error('Send error:', error)
    res.status(500).json({ error: error.message, hint: 'Please verify the AI site is fully loaded before sending.' })
  }
})

router.post('/read', async (req, res) => {
  const { sessionId } = req.body

  const session = sessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  const config = SITE_CONFIGS[session.providerId]
  if (!config || !config.responseSelector) {
    return res.status(400).json({ error: 'No read config for this provider' })
  }

  try {
    const { page } = session
    if (config.waitForResponse) {
      await page.waitForTimeout(config.waitForResponse)
    }

    const responses = await page.locator(config.responseSelector).all()
    const lastResponse = responses[responses.length - 1]

    if (lastResponse) {
      const text = await lastResponse.textContent()
      session.updatedAt = Date.now()
      session.lastUrl = page.url()
      res.json({ content: text || '', status: 'success' })
      return
    }

    res.json({ content: '', status: 'no_response', hint: 'No response node detected yet.' })
  } catch (error: any) {
    console.error('Read error:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/sessions', (_req, res) => {
  const list = Array.from(sessions.values()).map(toSummary)
  res.json(list)
})

router.post('/close', async (req, res) => {
  const { sessionId } = req.body

  const session = sessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  await closeSession(sessionId)
  res.json({ status: 'closed' })
})

router.post('/clear', async (req, res) => {
  const { sessionId } = req.body
  const session = sessions.get(sessionId)

  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  await closeSession(sessionId)
  await fs.rm(session.userDataDir, { recursive: true, force: true }).catch(() => undefined)
  res.json({ status: 'cleared' })
})

router.post('/close-all', async (_req, res) => {
  for (const sessionId of [...sessions.keys()]) {
    await closeSession(sessionId)
  }

  res.json({ status: 'all closed' })
})

async function ensureSession(sessionId: string, providerId: string, url: string): Promise<BrowserSession> {
  const existing = sessions.get(sessionId)
  if (existing) {
    existing.updatedAt = Date.now()
    existing.lastUrl = url
    return existing
  }

  await fs.mkdir(SESSION_ROOT, { recursive: true })
  const userDataDir = path.join(SESSION_ROOT, sessionId)
  await fs.mkdir(userDataDir, { recursive: true })

  const context = await launchPersistentContext(userDataDir)
  const page = context.pages()[0] ?? await context.newPage()

  const session: BrowserSession = {
    id: sessionId,
    providerId,
    userDataDir,
    context,
    page,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastUrl: url,
  }

  sessions.set(sessionId, session)
  return session
}

async function launchPersistentContext(userDataDir: string): Promise<BrowserContext> {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: ['--start-maximized'],
    })
  } catch {
    return await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
      args: ['--start-maximized'],
    })
  }
}

async function navigateIfNeeded(session: BrowserSession, url: string): Promise<void> {
  if (session.page.url() !== url) {
    await session.page.goto(url, { waitUntil: 'domcontentloaded' })
    session.lastUrl = url
    session.updatedAt = Date.now()
  }
}

async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) {
    return
  }

  try {
    await session.context.close()
  } finally {
    sessions.delete(sessionId)
  }
}

function toSummary(session: BrowserSession): BrowserSessionSummary {
  return {
    id: session.id,
    providerId: session.providerId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastUrl: session.lastUrl,
    hasPrompt: Boolean(session.lastPrompt),
  }
}

export default router
