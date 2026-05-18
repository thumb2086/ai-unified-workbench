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
  preferredModel?: string
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
  model?: string
}

export interface ProviderAutomationMatrix {
  providerId: string
  providerName: string
  supportsPromptInput: boolean
  supportsResponseRead: boolean
  supportsModelSelection: boolean
  supportedEntryUrls: string[]
  notes: string[]
}

interface ProviderAutomationConfig {
  inputSelector: string
  sendButtonSelector?: string
  responseSelector?: string
  waitForResponse?: number
  sendKey?: string
  modelMenuSelector?: string
  modelOptionSelector?: string
  supportedEntryUrls: string[]
  notes: string[]
  supportsModelSelection?: boolean
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
    modelMenuSelector: 'button[data-testid*="model"], button[aria-label*="model"]',
    modelOptionSelector: '[role="menuitem"], [role="option"], button',
    supportedEntryUrls: ['https://chatgpt.com/', 'https://chat.openai.com/'],
    supportsModelSelection: true,
    notes: [
      '已整理常用入口網址、輸入框與送出按鈕 selector。',
      '模型切換目前是 best-effort，仍需要登入後實站驗證。',
    ],
  },
  gemini: {
    inputSelector: 'textarea[placeholder*="Enter"], [contenteditable="true"][role="textbox"], [contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Send"], button.send-button',
    responseSelector: '.response-content, .message-content, [data-testid="response"]',
    waitForResponse: 3500,
    sendKey: 'Enter',
    modelMenuSelector: 'button[aria-label*="model"], div[role="button"][aria-label*="model"], mat-select',
    modelOptionSelector: '[role="option"], mat-option, button',
    supportedEntryUrls: ['https://gemini.google.com/app'],
    supportsModelSelection: true,
    notes: [
      '已整理 Gemini App 入口與主要輸入區 selector。',
      'Gemini 介面變動偏快，模型選單 selector 需要持續維護。',
    ],
  },
  aistudio: {
    inputSelector: 'textarea[aria-label*="Prompt"], textarea[placeholder*="prompt"], [contenteditable="true"][role="textbox"], [contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Run"], button[aria-label*="Send"], button[type="submit"]',
    responseSelector: '[data-testid="generated-response"], .response-content, .markdown, .prose',
    waitForResponse: 4000,
    sendKey: 'Enter',
    modelMenuSelector: 'button[aria-label*="Model"], div[role="button"][aria-label*="Model"], mat-select',
    modelOptionSelector: '[role="option"], mat-option, button',
    supportedEntryUrls: ['https://aistudio.google.com/prompts/new_chat', 'https://aistudio.google.com/app/prompts/new_chat'],
    supportsModelSelection: true,
    notes: [
      'AI Studio 採用與 Gemini 相近的 Google 介面結構，優先支援 prompts/new_chat 入口。',
      '模型切換與輸入框 selector 目前為 best-effort，仍需登入後依實際 DOM 微調。',
    ],
  },
  claude: {
    inputSelector: 'div[contenteditable="true"], textarea[placeholder*="Message"], [contenteditable="true"]',
    sendButtonSelector: 'button[type="submit"], button[aria-label*="Send"]',
    responseSelector: '.font-claude-message, .claude-message, .message-content, [data-testid="assistant-message"]',
    waitForResponse: 4500,
    sendKey: 'Enter',
    modelMenuSelector: 'button[aria-label*="model"], button[data-testid*="model"]',
    modelOptionSelector: '[role="menuitemradio"], [role="option"], button',
    supportedEntryUrls: ['https://claude.ai/new', 'https://claude.ai/chats'],
    supportsModelSelection: true,
    notes: [
      '已整理 Claude 新對話頁與 chats 入口。',
      'Claude 模型切換 selector 已預留，但仍需登入後逐站驗證。',
    ],
  },
  grok: {
    inputSelector: 'textarea, [contenteditable="true"], input[type="text"]',
    sendButtonSelector: 'button[type="submit"], button[aria-label*="Send"]',
    responseSelector: '.message-content, .response, [data-testid="response"]',
    waitForResponse: 3500,
    sendKey: 'Enter',
    modelMenuSelector: 'button[aria-label*="model"], button[data-testid*="model"]',
    modelOptionSelector: '[role="menuitem"], [role="option"], button',
    supportedEntryUrls: ['https://grok.com/'],
    supportsModelSelection: true,
    notes: [
      '已整理 Grok 首頁輸入框與回覆區 selector。',
      'Grok 的模型切換同樣屬 best-effort，需要實際帳號驗證。',
    ],
  },
}

export async function openBrowserSession(
  payload: BrowserOpenPayload,
): Promise<{ sessionId?: string; providerId?: string; url?: string; status?: string; error?: string }> {
  const { providerId, url, providerName, forceNew, accountLabel, accountKey, model } = payload
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
      current.preferredModel = model || current.preferredModel
      if (model) {
        await applyModelSelection(current.page, current.providerId, model).catch(() => undefined)
      }
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
      providerName: providerName || getProviderName(providerId),
      url: page.url() || url,
      accountLabel,
      accountKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasPrompt: false,
      preferredModel: model,
      browser,
      page,
      userDataDir,
    }

    sessions.set(sessionId, summary)
    if (model) {
      await applyModelSelection(page, providerId, model).catch(() => undefined)
    }
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
    if (session.preferredModel) {
      await applyModelSelection(session.page, session.providerId, session.preferredModel).catch(() => undefined)
    }
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
      const doc = (globalThis as any).document as any
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

export function listProviderAutomationMatrix(): ProviderAutomationMatrix[] {
  return Object.entries(PROVIDER_CONFIGS).map(([providerId, config]) => ({
    providerId,
    providerName: getProviderName(providerId),
    supportsPromptInput: Boolean(config.inputSelector),
    supportsResponseRead: Boolean(config.responseSelector),
    supportsModelSelection: Boolean(config.supportsModelSelection && config.modelMenuSelector && config.modelOptionSelector),
    supportedEntryUrls: config.supportedEntryUrls,
    notes: config.notes,
  }))
}

export async function setBrowserSessionModel(
  sessionId: string,
  model: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }
  if (!model.trim()) {
    return { success: false, error: 'Model is required' }
  }

  try {
    const applied = await applyModelSelection(session.page, session.providerId, model)
    session.preferredModel = model
    session.updatedAt = Date.now()
    return {
      success: true,
      data: {
        status: applied ? 'applied' : 'saved-preference-only',
        model,
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to set model' }
  }
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

function getProviderName(providerId: string): string {
  const names: Record<string, string> = {
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    aistudio: 'AI Studio',
    claude: 'Claude',
    grok: 'Grok',
  }
  return names[providerId] || providerId
}

async function applyModelSelection(page: Page, providerId: string, model: string): Promise<boolean> {
  const config = PROVIDER_CONFIGS[providerId]
  if (!config?.supportsModelSelection || !config.modelMenuSelector || !config.modelOptionSelector) {
    return false
  }

  try {
    await page.bringToFront().catch(() => undefined)
    const opened = await page.evaluate(({ modelMenuSelector }) => {
      const doc = (globalThis as any).document as any
      const menu = doc.querySelector(modelMenuSelector) as any
      if (!menu) return false
      menu.click()
      return true
    }, { modelMenuSelector: config.modelMenuSelector })

    if (!opened) return false
    await delay(700)

    const selected = await page.evaluate(({ optionSelector, targetModel }) => {
      const doc = (globalThis as any).document as any
      const target = String(targetModel || '').trim().toLowerCase()
      const options = Array.from(doc.querySelectorAll(optionSelector)) as any[]
      for (const option of options) {
        const text = (option.innerText || option.textContent || '').trim().toLowerCase()
        if (text && text.includes(target)) {
          option.click()
          return true
        }
      }
      return false
    }, {
      optionSelector: config.modelOptionSelector,
      targetModel: model,
    })

    return Boolean(selected)
  } catch {
    return false
  }
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
