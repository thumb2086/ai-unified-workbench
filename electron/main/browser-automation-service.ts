import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import puppeteer, { Browser, Page } from 'puppeteer'

export interface BrowserSessionSummary {
  id: string
  providerId: string
  providerName: string
  url: string
  accountLabel?: string
  accountKey?: string
  createdAt: number
  updatedAt: number
  hasPrompt: boolean
}

interface BrowserSessionState extends BrowserSessionSummary {
  browser: Browser
  page: Page
  userDataDir: string
  lastPrompt?: string
}

interface BrowserOpenPayload {
  providerId: string
  url: string
  sessionId?: string
  providerName?: string
  forceNew?: boolean
  accountLabel?: string
  accountKey?: string
}

interface ProviderAutomationConfig {
  inputSelector: string
  sendButtonSelector?: string
  responseSelector?: string
  waitForResponse?: number
  sendKey?: string
}

const SESSION_ROOT = path.join(process.cwd(), '.browser-profiles')
const sessions = new Map<string, BrowserSessionState>()

const PROVIDER_CONFIGS: Record<string, ProviderAutomationConfig> = {
  chatgpt: {
    inputSelector: '#prompt-textarea, textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [contenteditable="true"]',
    sendButtonSelector: 'button[data-testid="send-button"], button[aria-label*="Send"]',
    responseSelector: '[data-message-author-role="assistant"]:last-child, .markdown:last-child',
    waitForResponse: 3500,
    sendKey: 'Enter',
  },
  gemini: {
    inputSelector: 'textarea[placeholder*="Enter"], [contenteditable="true"][role="textbox"], [contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Send"], button.send-button',
    responseSelector: '.response-content, .message-content, [data-testid="response"]',
    waitForResponse: 3500,
    sendKey: 'Enter',
  },
  claude: {
    inputSelector: 'div[contenteditable="true"], textarea[placeholder*="Message"], [contenteditable="true"]',
    sendButtonSelector: 'button[type="submit"], button[aria-label*="Send"]',
    responseSelector: '.font-claude-message, .claude-message, .message-content, [data-testid="assistant-message"]',
    waitForResponse: 4500,
    sendKey: 'Enter',
  },
  grok: {
    inputSelector: 'textarea, [contenteditable="true"], input[type="text"]',
    sendButtonSelector: 'button[type="submit"], button[aria-label*="Send"]',
    responseSelector: '.message-content, .response, [data-testid="response"]',
    waitForResponse: 3500,
    sendKey: 'Enter',
  },
}

export async function openBrowserSession(
  payload: BrowserOpenPayload,
): Promise<{ sessionId?: string; providerId?: string; url?: string; status?: string; error?: string }> {
  const { providerId, url, providerName, forceNew, accountLabel, accountKey } = payload
  const sessionId = payload.sessionId || `session_${providerId}_${Date.now()}`
  if (!providerId || !url) {
    return { error: 'Missing providerId or url' }
  }

  try {
    const current = !forceNew ? sessions.get(sessionId) : undefined
    if (current) {
      await focusPage(current.page, url)
      current.updatedAt = Date.now()
      current.url = current.page.url() || url
      current.providerName = providerName || current.providerName
      current.accountLabel = accountLabel
      current.accountKey = accountKey
      return {
        sessionId: current.id,
        providerId: current.providerId,
        url: current.url,
        status: 'opened',
      }
    }

    await fs.mkdir(SESSION_ROOT, { recursive: true })
    const userDataDir = path.join(SESSION_ROOT, buildProfileFolderName(sessionId, accountKey))
    await fs.mkdir(userDataDir, { recursive: true })

    const browser = await launchBrowser(userDataDir)
    const pages = await browser.pages()
    const page = pages[0] ?? await browser.newPage()
    await page.setViewport(null)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await focusPage(page, url)

    const summary: BrowserSessionState = {
      id: sessionId,
      providerId,
      providerName: providerName || providerId,
      url: page.url() || url,
      accountLabel,
      accountKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasPrompt: false,
      browser,
      page,
      userDataDir,
    }

    sessions.set(sessionId, summary)
    browser.on('disconnected', () => {
      sessions.delete(sessionId)
    })

    return {
      sessionId: summary.id,
      providerId: summary.providerId,
      url: summary.url,
      status: 'opened',
    }
  } catch (error: any) {
    return { error: error.message || 'Failed to open browser session' }
  }
}

export async function sendPromptToBrowserSession(
  sessionId: string,
  prompt: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  const config = PROVIDER_CONFIGS[session.providerId]
  if (!config) {
    return { success: false, error: 'No automation config for this provider' }
  }

  try {
    await session.page.bringToFront().catch(() => undefined)
    await session.page.waitForSelector(config.inputSelector, { timeout: 15000 })
    const result = await session.page.evaluate(
      ({ nextPrompt, providerConfig }) => {
        const runtime = globalThis as any
        const doc = runtime.document as any
        const input = doc.querySelector(providerConfig.inputSelector) as any
        if (!input) {
          return { error: 'Input not found' }
        }

        const setText = (element: any, value: string) => {
          if (element.value !== undefined) {
            const proto = Object.getPrototypeOf(element)
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
              || Object.getOwnPropertyDescriptor(runtime.HTMLTextAreaElement?.prototype || {}, 'value')
              || Object.getOwnPropertyDescriptor(runtime.HTMLInputElement?.prototype || {}, 'value')
            descriptor?.set?.call(element, value)
            element.dispatchEvent(new Event('input', { bubbles: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
            return
          }

          element.textContent = value
          element.dispatchEvent(new runtime.InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: value,
          }))
        }

        input.focus()
        setText(input, nextPrompt)

        const sendButton = providerConfig.sendButtonSelector
          ? doc.querySelector(providerConfig.sendButtonSelector) as any
          : null

        if (sendButton) {
          sendButton.click()
          return { status: 'sent' }
        }

        input.dispatchEvent(new runtime.KeyboardEvent('keydown', { key: providerConfig.sendKey || 'Enter', bubbles: true }))
        input.dispatchEvent(new runtime.KeyboardEvent('keyup', { key: providerConfig.sendKey || 'Enter', bubbles: true }))
        return { status: 'sent' }
      },
      { nextPrompt: prompt, providerConfig: config },
    )

    if ((result as { error?: string }).error) {
      return { success: false, error: (result as { error: string }).error }
    }

    session.lastPrompt = prompt
    session.hasPrompt = true
    session.updatedAt = Date.now()
    session.url = session.page.url()
    return { success: true, data: result }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to send prompt' }
  }
}

export async function readBrowserSessionResponse(
  sessionId: string,
): Promise<{ content?: string; status?: string; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { error: 'Session not found' }
  }

  const config = PROVIDER_CONFIGS[session.providerId]
  if (!config?.responseSelector) {
    return { error: 'No response reader configured for this provider' }
  }

  try {
    if (config.waitForResponse) {
      await delay(config.waitForResponse)
    }

    const content = await session.page.evaluate((responseSelector) => {
      const runtime = globalThis as any
      const doc = runtime.document as any
      const matches = Array.from(doc.querySelectorAll(responseSelector))
      const last = matches[matches.length - 1] as any
      return last?.innerText || last?.textContent || ''
    }, config.responseSelector)

    session.updatedAt = Date.now()
    session.url = session.page.url()
    return {
      content,
      status: content ? 'success' : 'no_response',
    }
  } catch (error: any) {
    return { error: error.message || 'Failed to read response' }
  }
}

export function listBrowserSessions(): BrowserSessionSummary[] {
  return Array.from(sessions.values()).map(({ browser: _browser, page: _page, userDataDir: _userDataDir, lastPrompt, ...summary }) => ({
    ...summary,
    hasPrompt: Boolean(lastPrompt),
  }))
}

export async function closeBrowserSession(sessionId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  try {
    await session.browser.close()
    sessions.delete(sessionId)
    return { success: true, data: { status: 'closed' } }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to close session' }
  }
}

export async function clearBrowserSessionData(sessionId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  try {
    await session.browser.close().catch(() => undefined)
    sessions.delete(sessionId)
    await fs.rm(session.userDataDir, { recursive: true, force: true }).catch(() => undefined)
    return { success: true, data: { status: 'cleared' } }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to clear session' }
  }
}

export async function closeAllBrowserSessions(): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const openIds = [...sessions.keys()]
  for (const sessionId of openIds) {
    await closeBrowserSession(sessionId)
  }
  return { success: true, data: { status: 'all closed' } }
}

async function launchBrowser(userDataDir: string): Promise<Browser> {
  const options = {
    headless: false,
    defaultViewport: null,
    userDataDir,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--start-maximized',
    ],
  }

  try {
    return await puppeteer.launch({
      ...options,
      channel: 'chrome',
    })
  } catch {
    return puppeteer.launch(options)
  }
}

async function focusPage(page: Page, url: string): Promise<void> {
  if (page.url() !== url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  }
  await page.bringToFront().catch(() => undefined)
}

function buildProfileFolderName(sessionId: string, accountKey?: string): string {
  const keyPart = (accountKey || 'default').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)
  return `${sessionId}-${keyPart}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getChromeUserDataPath(): string {
  const home = os.homedir()
  switch (os.platform()) {
    case 'win32':
      return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')
    case 'linux':
      return path.join(home, '.config', 'google-chrome')
    default:
      return ''
  }
}
