// Use require for CommonJS compatibility
const { contextBridge, ipcRenderer } = require('electron')

type IpcRendererEvent = any

// ============================================================================
// Types exposed to renderer
// ============================================================================

export interface WebviewConfig {
  slotId: string
  url: string
  name?: string
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface WorkflowNode {
  id: string
  type: 'prompt' | 'agent' | 'tool' | 'condition'
  provider?: string
  prompt?: string
  tool?: string
  dependsOn?: string[]
}

export interface WorkflowDefinition {
  name: string
  nodes: WorkflowNode[]
}

// ============================================================================
// API exposed to renderer
// ============================================================================

const aiWorkbenchAPI = {
  // Version
  version: '0.3.0',

  // ==========================================================================
  // Webview Management
  // ==========================================================================

  async createWebview(config: WebviewConfig): Promise<{ success: boolean; partition: string; error?: string }> {
    return ipcRenderer.invoke('webview:create', config)
  },

  async injectScript(slotId: string, script: string): Promise<ToolResult> {
    return ipcRenderer.invoke('webview:inject', { slotId, script })
  },

  async sendPrompt(slotId: string, prompt: string, provider: string): Promise<ToolResult> {
    return ipcRenderer.invoke('webview:sendPrompt', { slotId, prompt, provider })
  },

  async readResponse(slotId: string): Promise<ToolResult> {
    return ipcRenderer.invoke('webview:readResponse', slotId)
  },

  async destroyWebview(slotId: string): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('webview:destroy', slotId)
  },

  async clearSession(slotId: string): Promise<ToolResult> {
    return ipcRenderer.invoke('webview:clearSession', slotId)
  },

  async registerWebview(slotId: string, webContentsId: number): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('webview:register', slotId, webContentsId)
  },

  // ==========================================================================
  // Tool Calls (restricted to Tool Agent)
  // ==========================================================================

  async fsRead(filePath: string): Promise<ToolResult> {
    return ipcRenderer.invoke('tool:fsRead', filePath)
  },

  async fsWrite(filePath: string, content: string): Promise<ToolResult> {
    return ipcRenderer.invoke('tool:fsWrite', { filePath, content })
  },

  async fsList(dirPath: string): Promise<ToolResult> {
    return ipcRenderer.invoke('tool:fsList', dirPath)
  },

  async shell(command: string): Promise<ToolResult> {
    return ipcRenderer.invoke('tool:shell', command)
  },

  async clipboardRead(): Promise<ToolResult> {
    return ipcRenderer.invoke('tool:clipboardRead')
  },

  async clipboardWrite(text: string): Promise<ToolResult> {
    return ipcRenderer.invoke('tool:clipboardWrite', text)
  },

  // ==========================================================================
  // Workflow Management
  // ==========================================================================

  async loadWorkflow(name: string): Promise<ToolResult> {
    return ipcRenderer.invoke('workflow:load', name)
  },

  async saveWorkflow(name: string, content: string): Promise<ToolResult> {
    return ipcRenderer.invoke('workflow:save', { name, content })
  },

  async listWorkflows(): Promise<ToolResult> {
    return ipcRenderer.invoke('workflow:list')
  },

  // ==========================================================================
  // Agent Coordination
  // ==========================================================================

  async broadcastToAgents(slotIds: string[], prompt: string): Promise<ToolResult> {
    return ipcRenderer.invoke('agent:broadcast', { slotIds, prompt })
  },

  // ==========================================================================
  // Chrome Profile Management
  // ==========================================================================

  async listChromeProfiles(): Promise<ToolResult> {
    return ipcRenderer.invoke('chrome:listProfiles')
  },

  async importChromeCookies(slotId: string, profilePath: string): Promise<ToolResult> {
    return ipcRenderer.invoke('chrome:importCookies', { slotId, profilePath })
  },

  // ==========================================================================
  // Event Listeners (for workflow progress, webview updates, etc.)
  // ==========================================================================

  onWorkflowProgress(callback: (data: { nodeId: string; status: string; result?: unknown }) => void): () => void {
    const handler = (_event: any, data: unknown) => callback(data as { nodeId: string; status: string; result?: unknown })
    ipcRenderer.on('workflow:progress', handler)
    return () => ipcRenderer.removeListener('workflow:progress', handler)
  },

  onWebviewUpdate(callback: (data: { slotId: string; event: string; data?: unknown }) => void): () => void {
    const handler = (_event: any, data: unknown) => callback(data as { slotId: string; event: string; data?: unknown })
    ipcRenderer.on('webview:update', handler)
    return () => ipcRenderer.removeListener('webview:update', handler)
  }
}

// Expose API to window object
contextBridge.exposeInMainWorld('aiWorkbench', aiWorkbenchAPI)

// ============================================================================
// Type declarations for TypeScript
// ============================================================================

declare global {
  interface Window {
    aiWorkbench: typeof aiWorkbenchAPI
  }
}

export { aiWorkbenchAPI }
