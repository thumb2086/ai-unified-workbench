// Use require for CommonJS compatibility
const { ipcMain, BrowserWindow } = require('electron')
import { configureSessionPartition, generatePartition, clearSession } from './session-manager'
import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as crypto from 'crypto'

const execAsync = promisify(exec)

// Type aliases
type IpcMainInvokeEvent = any
type WebContents = any

// Store active webview references
const activeWebviews = new Map<string, WebContents>()

interface BrowserSessionWindow {
  id: string
  providerId: string
  providerName: string
  url: string
  accountLabel?: string
  accountKey?: string
  window: any
  createdAt: number
  updatedAt: number
  lastPrompt?: string
}

interface BrowserSessionSummary {
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

const browserSessions = new Map<string, BrowserSessionWindow>()

const BROWSER_SITE_CONFIGS: Record<string, {
  inputSelector: string
  sendButtonSelector?: string
  responseSelector?: string
  sendKey?: string
  waitForResponse?: number
}> = {
  chatgpt: {
    inputSelector: '#prompt-textarea, textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [contenteditable="true"]',
    sendButtonSelector: 'button[data-testid="send-button"], button[aria-label*="Send"]',
    responseSelector: '[data-message-author-role="assistant"]:last-child, .markdown:last-child',
    sendKey: 'Enter',
    waitForResponse: 3000,
  },
  gemini: {
    inputSelector: 'textarea[placeholder*="Enter"], textarea[placeholder*="輸入"], [contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Send"], button.send-button',
    responseSelector: '.response-content, .message-content, [data-testid="response"]',
    sendKey: 'Enter',
    waitForResponse: 3000,
  },
  claude: {
    inputSelector: 'textarea[placeholder*="Message"], textarea[placeholder*="Ask"], [contenteditable="true"]',
    sendButtonSelector: 'button[type="submit"], button[aria-label*="Send"]',
    responseSelector: '.claude-message, .message-content, [data-testid="assistant-message"]',
    sendKey: 'Enter',
    waitForResponse: 4000,
  },
  grok: {
    inputSelector: 'textarea, [contenteditable="true"], input[type="text"]',
    sendButtonSelector: 'button[type="submit"]',
    responseSelector: '.message-content, .response, [data-testid="response"]',
    sendKey: 'Enter',
    waitForResponse: 3000,
  },
}

type BrowserSiteConfig = (typeof BROWSER_SITE_CONFIGS)[keyof typeof BROWSER_SITE_CONFIGS]

// Tool execution result
interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
  // Webview management
  ipcMain.handle('webview:create', handleCreateWebview)
  ipcMain.handle('webview:inject', handleInjectScript)
  ipcMain.handle('webview:sendPrompt', handleSendPrompt)
  ipcMain.handle('webview:readResponse', handleReadResponse)
  ipcMain.handle('webview:destroy', handleDestroyWebview)
  ipcMain.handle('webview:clearSession', handleClearSession)

  // Tool calls (restricted to Tool Agent)
  ipcMain.handle('tool:fsRead', handleFsRead)
  ipcMain.handle('tool:fsWrite', handleFsWrite)
  ipcMain.handle('tool:fsList', handleFsList)
  ipcMain.handle('tool:shell', handleShell)
  ipcMain.handle('tool:clipboardRead', handleClipboardRead)
  ipcMain.handle('tool:clipboardWrite', handleClipboardWrite)

  // Workflow
  ipcMain.handle('workflow:load', handleLoadWorkflow)
  ipcMain.handle('workflow:save', handleSaveWorkflow)
  ipcMain.handle('workflow:list', handleListWorkflows)

  // Agent coordination
  ipcMain.handle('agent:broadcast', handleAgentBroadcast)

  // Browser sessions
  ipcMain.handle('browser:open', handleBrowserOpen)
  ipcMain.handle('browser:send', handleBrowserSend)
  ipcMain.handle('browser:read', handleBrowserRead)
  ipcMain.handle('browser:close', handleBrowserClose)
  ipcMain.handle('browser:clear', handleBrowserClear)
  ipcMain.handle('browser:close-all', handleBrowserCloseAll)
  ipcMain.handle('browser:list', handleBrowserList)

  // Chrome profiles
  ipcMain.handle('chrome:listProfiles', handleListChromeProfiles)
  ipcMain.handle('chrome:importCookies', handleImportChromeCookies)
}

// ============================================================================
// Webview Handlers
// ============================================================================

interface CreateWebviewPayload {
  slotId: string
  url: string
  name?: string
}

async function handleCreateWebview(
  _event: IpcMainInvokeEvent,
  payload: CreateWebviewPayload
): Promise<{ success: boolean; partition: string; error?: string }> {
  try {
    const partition = generatePartition(payload.slotId)
    configureSessionPartition(partition)

    // The actual webview creation happens in renderer via <webview> tag
    // We just configure the session here

    return { success: true, partition }
  } catch (error) {
    return {
      success: false,
      partition: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

interface InjectPayload {
  slotId: string
  script: string
}

async function handleInjectScript(
  _event: IpcMainInvokeEvent,
  payload: InjectPayload
): Promise<ToolResult> {
  const webview = activeWebviews.get(payload.slotId)
  if (!webview) {
    return { success: false, error: `Webview ${payload.slotId} not found` }
  }

  try {
    const result = await webview.executeJavaScript(payload.script)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Script execution failed'
    }
  }
}

interface SendPromptPayload {
  slotId: string
  prompt: string
  provider: 'chatgpt' | 'gemini' | 'claude' | 'grok'
}

async function handleSendPrompt(
  _event: IpcMainInvokeEvent,
  payload: SendPromptPayload
): Promise<ToolResult> {
  const webview = activeWebviews.get(payload.slotId)
  if (!webview) {
    return { success: false, error: `Webview ${payload.slotId} not found` }
  }

  try {
    // Provider-specific injection scripts
    const scripts: Record<string, string> = {
      chatgpt: `
        const textarea = document.querySelector('textarea[placeholder*="Message"], textarea[data-placeholder*="Message"]');
        if (textarea) {
          textarea.value = ${JSON.stringify(payload.prompt)};
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          const button = textarea.closest('form')?.querySelector('button[type="submit"]');
          if (button) button.click();
          return { injected: true, provider: 'chatgpt' };
        }
        return { injected: false, error: 'Textarea not found' };
      `,
      gemini: `
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        if (editor) {
          editor.innerText = ${JSON.stringify(payload.prompt)};
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          const sendBtn = document.querySelector('[aria-label*="Send"], button[data-testid="send-button"]');
          if (sendBtn) sendBtn.click();
          return { injected: true, provider: 'gemini' };
        }
        return { injected: false, error: 'Editor not found' };
      `,
      claude: `
        const textarea = document.querySelector('div[contenteditable="true"]');
        if (textarea) {
          textarea.innerText = ${JSON.stringify(payload.prompt)};
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          const sendBtn = document.querySelector('button[aria-label*="Send"]');
          if (sendBtn) sendBtn.click();
          return { injected: true, provider: 'claude' };
        }
        return { injected: false, error: 'Textarea not found' };
      `,
      grok: `
        const textarea = document.querySelector('textarea');
        if (textarea) {
          textarea.value = ${JSON.stringify(payload.prompt)};
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          const form = textarea.closest('form');
          if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
          return { injected: true, provider: 'grok' };
        }
        return { injected: false, error: 'Textarea not found' };
      `
    }

    const script = scripts[payload.provider]
    if (!script) {
      return { success: false, error: `Unknown provider: ${payload.provider}` }
    }

    const result = await webview.executeJavaScript(script)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send prompt'
    }
  }
}

async function handleReadResponse(
  _event: IpcMainInvokeEvent,
  slotId: string
): Promise<ToolResult> {
  const webview = activeWebviews.get(slotId)
  if (!webview) {
    return { success: false, error: `Webview ${slotId} not found` }
  }

  try {
    const script = `
      // Try to find the last AI response on the page
      const responses = document.querySelectorAll('[data-message-author-role="assistant"], .message-content, .prose, [class*="response"]');
      const lastResponse = responses[responses.length - 1];
      return lastResponse ? lastResponse.innerText : null;
    `
    const result = await webview.executeJavaScript(script)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read response'
    }
  }
}

async function handleDestroyWebview(
  _event: IpcMainInvokeEvent,
  slotId: string
): Promise<{ success: boolean }> {
  activeWebviews.delete(slotId)
  return { success: true }
}

async function handleClearSession(
  _event: IpcMainInvokeEvent,
  slotId: string
): Promise<ToolResult> {
  try {
    await clearSession(generatePartition(slotId))
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear session'
    }
  }
}

// ============================================================================
// Browser Session Handlers
// ============================================================================

interface BrowserOpenPayload {
  providerId: string
  url: string
  sessionId?: string
  providerName?: string
  forceNew?: boolean
  accountLabel?: string
  accountKey?: string
}

async function handleBrowserOpen(
  _event: IpcMainInvokeEvent,
  payload: BrowserOpenPayload
): Promise<{ sessionId?: string; providerId?: string; url?: string; status?: string; error?: string }> {
  const { providerId, url, sessionId: requestedSessionId, providerName, forceNew, accountLabel, accountKey } = payload

  if (!providerId || !url) {
    return { error: 'Missing providerId or url' }
  }

  const sessionId = requestedSessionId || `session_${providerId}_${Date.now()}`

  try {
    const session = forceNew
      ? await createBrowserSession(sessionId, providerId, providerName || providerId, url, accountLabel, accountKey)
      : await getOrCreateBrowserSession(sessionId, providerId, providerName || providerId, url, accountLabel, accountKey)

    await focusBrowserSession(session, url)

    return {
      sessionId: session.id,
      providerId: session.providerId,
      url: session.url,
      status: 'opened',
    }
  } catch (error: any) {
    console.error('Browser open error:', error)
    return { error: error.message || 'Failed to open browser session' }
  }
}

async function handleBrowserSend(
  _event: IpcMainInvokeEvent,
  payload: { sessionId: string; prompt: string }
): Promise<ToolResult> {
  const session = browserSessions.get(payload.sessionId)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  const config = BROWSER_SITE_CONFIGS[session.providerId]
  if (!config) {
    return { success: false, error: 'No automation config for this provider' }
  }

  try {
    await session.window.webContents.executeJavaScript(buildSendScript(payload.prompt, config), true)
    session.lastPrompt = payload.prompt
    session.updatedAt = Date.now()
    session.url = session.window.webContents.getURL() || session.url
    return { success: true, data: { status: 'sent' } }
  } catch (error: any) {
    console.error('Browser send error:', error)
    return { success: false, error: error.message || 'Failed to send prompt' }
  }
}

async function handleBrowserRead(
  _event: IpcMainInvokeEvent,
  payload: { sessionId: string }
): Promise<{ content?: string; status?: string; error?: string }> {
  const session = browserSessions.get(payload.sessionId)
  if (!session) {
    return { error: 'Session not found' }
  }

  const config = BROWSER_SITE_CONFIGS[session.providerId]
  if (!config || !config.responseSelector) {
    return { error: 'No read config for this provider' }
  }

  try {
    if (config.waitForResponse) {
      await delay(config.waitForResponse)
    }

    const content = await session.window.webContents.executeJavaScript(buildReadScript(config), true)
    session.updatedAt = Date.now()
    session.url = session.window.webContents.getURL() || session.url
    return { content: String(content || ''), status: content ? 'success' : 'no_response' }
  } catch (error: any) {
    console.error('Browser read error:', error)
    return { error: error.message || 'Failed to read response' }
  }
}

async function handleBrowserClose(
  _event: IpcMainInvokeEvent,
  payload: { sessionId: string }
): Promise<ToolResult> {
  try {
    await closeBrowserSession(payload.sessionId)
    return { success: true, data: { status: 'closed' } }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to close browser session' }
  }
}

async function handleBrowserClear(
  _event: IpcMainInvokeEvent,
  payload: { sessionId: string }
): Promise<ToolResult> {
  try {
    await closeBrowserSession(payload.sessionId)
    await clearSession(generatePartition(payload.sessionId))
    return { success: true, data: { status: 'cleared' } }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to clear browser session' }
  }
}

async function handleBrowserCloseAll(): Promise<ToolResult> {
  try {
    await closeAllBrowserSessions()
    return { success: true, data: { status: 'all closed' } }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to close browser sessions' }
  }
}

function handleBrowserList(): BrowserSessionSummary[] {
  return Array.from(browserSessions.values()).map(session => ({
    id: session.id,
    providerId: session.providerId,
    providerName: session.providerName,
    url: session.url,
    accountLabel: session.accountLabel,
    accountKey: session.accountKey,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    hasPrompt: Boolean(session.lastPrompt),
  }))
}

async function createBrowserSession(
  sessionId: string,
  providerId: string,
  providerName: string,
  url: string,
  accountLabel?: string,
  accountKey?: string,
): Promise<BrowserSessionWindow> {
  await closeBrowserSession(sessionId)

  const partition = generatePartition(sessionId)
  configureSessionPartition(partition)

  const window = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: providerName,
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  })

  const session: BrowserSessionWindow = {
    id: sessionId,
    providerId,
    providerName,
    url,
    accountLabel,
    accountKey,
    window,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  browserSessions.set(sessionId, session)
  window.on('closed', () => {
    browserSessions.delete(sessionId)
  })

  await window.loadURL(url)
  session.url = url
  return session
}

async function getOrCreateBrowserSession(
  sessionId: string,
  providerId: string,
  providerName: string,
  url: string,
  accountLabel?: string,
  accountKey?: string,
): Promise<BrowserSessionWindow> {
  const existing = browserSessions.get(sessionId)
  if (existing && !existing.window.isDestroyed()) {
    existing.providerId = providerId
    existing.providerName = providerName
    existing.url = url
    existing.accountLabel = accountLabel
    existing.accountKey = accountKey
    existing.updatedAt = Date.now()
    return existing
  }

  const duplicate = Array.from(browserSessions.values()).find(session => session.providerId === providerId && !session.window.isDestroyed())
  if (duplicate) {
    duplicate.providerName = providerName
    duplicate.url = url
    duplicate.accountLabel = accountLabel
    duplicate.accountKey = accountKey
    duplicate.updatedAt = Date.now()
    browserSessions.set(sessionId, duplicate)
    if (duplicate.id !== sessionId) {
      browserSessions.delete(duplicate.id)
      duplicate.id = sessionId
    }
    return duplicate
  }

  return createBrowserSession(sessionId, providerId, providerName, url, accountLabel, accountKey)
}

async function focusBrowserSession(session: BrowserSessionWindow, url: string): Promise<void> {
  if (session.window.isDestroyed()) {
    throw new Error('Browser window is destroyed')
  }

  if (!session.window.isVisible()) {
    session.window.show()
  }

  session.window.focus()

  const currentUrl = session.window.webContents.getURL()
  if (!currentUrl || currentUrl !== url) {
    await session.window.loadURL(url)
  }

  session.updatedAt = Date.now()
  session.url = session.window.webContents.getURL() || url
}

async function closeBrowserSession(sessionId: string): Promise<void> {
  const session = browserSessions.get(sessionId)
  if (!session) return

  try {
    if (!session.window.isDestroyed()) {
      session.window.removeAllListeners('closed')
      session.window.close()
    }
  } finally {
    browserSessions.delete(sessionId)
  }
}

async function closeAllBrowserSessions(): Promise<void> {
  for (const sessionId of [...browserSessions.keys()]) {
    await closeBrowserSession(sessionId)
  }
}

function buildSendScript(prompt: string, config: BrowserSiteConfig): string {
  const promptJson = JSON.stringify(prompt)
  const inputSelector = JSON.stringify(config.inputSelector)
  const sendButtonSelector = JSON.stringify(config.sendButtonSelector || '')
  const sendKey = JSON.stringify(config.sendKey || 'Enter')

  return `
    (() => {
      const prompt = ${promptJson};
      const inputSelector = ${inputSelector};
      const sendButtonSelector = ${sendButtonSelector};
      const sendKey = ${sendKey};
      const input = document.querySelector(inputSelector);
      if (!input) return { error: 'Input not found' };

      const setNativeValue = (element, value) => {
        const valueSetter = Object.getOwnPropertyDescriptor(element.__proto__, 'value')?.set
          || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (valueSetter) {
          valueSetter.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };

      if (input.isContentEditable) {
        input.focus();
        input.textContent = prompt;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
      } else {
        setNativeValue(input, prompt);
      }

      const sendButton = sendButtonSelector ? document.querySelector(sendButtonSelector) : null;
      if (sendButton) {
        sendButton.click();
        return { status: 'sent' };
      }

      input.dispatchEvent(new KeyboardEvent('keydown', { key: sendKey, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: sendKey, bubbles: true }));
      return { status: 'sent' };
    })()
  `
}

function buildReadScript(config: BrowserSiteConfig): string {
  const responseSelector = JSON.stringify(config.responseSelector || '')
  return `
    (() => {
      const selector = ${responseSelector};
      if (!selector) return '';
      const responses = Array.from(document.querySelectorAll(selector));
      const lastResponse = responses[responses.length - 1];
      return lastResponse ? (lastResponse.innerText || lastResponse.textContent || '') : '';
    })()
  `
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Tool Handlers (File System, Shell, Clipboard)
// ============================================================================

const ALLOWED_PATHS = [
  process.env.HOME || process.env.USERPROFILE || '',
  process.cwd()
].filter(Boolean)

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath)
  return ALLOWED_PATHS.some(allowed => resolved.startsWith(allowed))
}

async function handleFsRead(
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<ToolResult> {
  try {
    if (!isPathAllowed(filePath)) {
      return { success: false, error: 'Path not allowed' }
    }
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, data: content }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file'
    }
  }
}

interface FsWritePayload {
  filePath: string
  content: string
}

async function handleFsWrite(
  _event: IpcMainInvokeEvent,
  payload: FsWritePayload
): Promise<ToolResult> {
  try {
    if (!isPathAllowed(payload.filePath)) {
      return { success: false, error: 'Path not allowed' }
    }
    await fs.mkdir(path.dirname(payload.filePath), { recursive: true })
    await fs.writeFile(payload.filePath, payload.content, 'utf-8')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to write file'
    }
  }
}

async function handleFsList(
  _event: IpcMainInvokeEvent,
  dirPath: string
): Promise<ToolResult> {
  try {
    if (!isPathAllowed(dirPath)) {
      return { success: false, error: 'Path not allowed' }
    }
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return {
      success: true,
      data: entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file'
      }))
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list directory'
    }
  }
}

async function handleShell(
  _event: IpcMainInvokeEvent,
  command: string
): Promise<ToolResult> {
  // SECURITY: Limit allowed commands
  const ALLOWED_COMMANDS = ['git', 'npm', 'node', 'ls', 'cat', 'echo', 'mkdir', 'cd']
  const cmdPrefix = command.split(' ')[0]

  if (!ALLOWED_COMMANDS.includes(cmdPrefix)) {
    return { success: false, error: `Command '${cmdPrefix}' not allowed` }
  }

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 })
    return {
      success: true,
      data: { stdout, stderr }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Command execution failed'
    }
  }
}

async function handleClipboardRead(): Promise<ToolResult> {
  const { clipboard } = require('electron')
  try {
    const text = clipboard.readText()
    return { success: true, data: text }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read clipboard'
    }
  }
}

async function handleClipboardWrite(
  _event: IpcMainInvokeEvent,
  text: string
): Promise<ToolResult> {
  const { clipboard } = require('electron')
  try {
    clipboard.writeText(text)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to write clipboard'
    }
  }
}

// ============================================================================
// Workflow Handlers
// ============================================================================

const WORKFLOWS_DIR = path.join(process.cwd(), 'workflows')

async function handleLoadWorkflow(
  _event: IpcMainInvokeEvent,
  name: string
): Promise<ToolResult> {
  try {
    const filePath = path.join(WORKFLOWS_DIR, `${name}.yaml`)
    if (!isPathAllowed(filePath)) {
      return { success: false, error: 'Path not allowed' }
    }
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, data: content }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load workflow'
    }
  }
}

interface SaveWorkflowPayload {
  name: string
  content: string
}

async function handleSaveWorkflow(
  _event: IpcMainInvokeEvent,
  payload: SaveWorkflowPayload
): Promise<ToolResult> {
  try {
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true })
    const filePath = path.join(WORKFLOWS_DIR, `${payload.name}.yaml`)
    await fs.writeFile(filePath, payload.content, 'utf-8')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save workflow'
    }
  }
}

async function handleListWorkflows(): Promise<ToolResult> {
  try {
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true })
    const entries = await fs.readdir(WORKFLOWS_DIR)
    const workflows = entries
      .filter(e => e.endsWith('.yaml') || e.endsWith('.yml'))
      .map(e => e.replace(/\.ya?ml$/, ''))
    return { success: true, data: workflows }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list workflows'
    }
  }
}

// ============================================================================
// Agent Broadcast
// ============================================================================

interface BroadcastPayload {
  slotIds: string[]
  prompt: string
}

async function handleAgentBroadcast(
  _event: IpcMainInvokeEvent,
  payload: BroadcastPayload
): Promise<ToolResult> {
  const results: Record<string, unknown> = {}

  for (const slotId of payload.slotIds) {
    const webview = activeWebviews.get(slotId)
    if (webview) {
      try {
        // Try to detect provider from URL or use generic injection
        const result = await webview.executeJavaScript(`
          (function() {
            const url = window.location.href;
            const textarea = document.querySelector('textarea, [contenteditable="true"]');
            if (textarea) {
              if (textarea.tagName === 'TEXTAREA') {
                textarea.value = ${JSON.stringify(payload.prompt)};
              } else {
                textarea.innerText = ${JSON.stringify(payload.prompt)};
              }
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              const form = textarea.closest('form');
              if (form) {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
              }
              return { success: true, url };
            }
            return { success: false, error: 'No input found', url };
          })()
        `)
        results[slotId] = result
      } catch (error) {
        results[slotId] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    } else {
      results[slotId] = { success: false, error: 'Webview not found' }
    }
  }

  return { success: true, data: results }
}

/**
 * Register a webview when it's created in renderer
 * This is called via IPC from the renderer process
 */
export function registerWebview(slotId: string, webContentsId: number): void {
  const wc = BrowserWindow.getAllWindows()
    .flatMap((w: any) => w.webContents)
    .find((wc: any) => wc.id === webContentsId)

  if (wc) {
    activeWebviews.set(slotId, wc)
  }
}

/**
 * Get active webview for a slot
 */
export function getWebview(slotId: string): WebContents | undefined {
  return activeWebviews.get(slotId)
}

// ============================================================================
// Chrome Profile Handlers
// ============================================================================

import * as os from 'os'

interface ChromeProfile {
  name: string
  path: string
  isDefault: boolean
}

async function handleListChromeProfiles(): Promise<{ success: boolean; profiles: ChromeProfile[]; error?: string }> {
  try {
    const chromePath = getChromeUserDataPath()
    const fs = require('fs')
    
    if (!fs.existsSync(chromePath)) {
      return { success: false, profiles: [], error: 'Chrome not found' }
    }

    const profiles: ChromeProfile[] = []
    
    // Check for Default profile
    const defaultPath = path.join(chromePath, 'Default')
    if (fs.existsSync(defaultPath)) {
      profiles.push({ name: 'Default', path: defaultPath, isDefault: true })
    }

    // Check for numbered profiles (Profile 1, Profile 2, etc.)
    const entries = fs.readdirSync(chromePath)
    for (const entry of entries) {
      if (entry.startsWith('Profile ')) {
        const profilePath = path.join(chromePath, entry)
        if (fs.statSync(profilePath).isDirectory()) {
          profiles.push({ name: entry, path: profilePath, isDefault: false })
        }
      }
    }

    return { success: true, profiles }
  } catch (error) {
    return { 
      success: false, 
      profiles: [], 
      error: error instanceof Error ? error.message : 'Failed to list profiles' 
    }
  }
}

async function handleImportChromeCookies(
  _event: IpcMainInvokeEvent,
  payload: { slotId: string; profilePath: string }
): Promise<ToolResult> {
  try {
    const { slotId, profilePath } = payload
    
    // This is a simplified implementation
    // In a full implementation, you would:
    // 1. Read Chrome's Cookies file (SQLite)
    // 2. Parse the cookies for the target domain
    // 3. Set them in the webview's session
    
    const webview = activeWebviews.get(slotId)
    if (!webview) {
      return { success: false, error: 'Webview not found' }
    }

    // For now, just return success
    // Actual cookie import would require SQLite parsing
    return { 
      success: true, 
      data: `Cookies from ${profilePath} would be imported to ${slotId}` 
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import cookies' 
    }
  }
}

function getChromeUserDataPath(): string {
  const platform = os.platform()
  const home = os.homedir()

  switch (platform) {
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
