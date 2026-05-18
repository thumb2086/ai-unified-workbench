/// <reference types="electron" />

import { ToolResult } from './workflow'

export interface WebviewConfig {
  slotId: string
  url: string
  name?: string
}

declare global {
  interface Window {
    aiWorkbench: {
      version: string

      openSession(payload: { providerId: string; url: string; sessionId?: string; providerName?: string; forceNew?: boolean; accountLabel?: string; accountKey?: string; model?: string }): Promise<{ sessionId?: string; providerId?: string; url?: string; status?: string; error?: string }>
      sendPromptToSession(sessionId: string, prompt: string): Promise<ToolResult>
      readSessionResponse(sessionId: string): Promise<{ content?: string; status?: string; error?: string }>
      closeSession(sessionId: string): Promise<ToolResult>
      clearSessionData(sessionId: string): Promise<ToolResult>
      listSessions(): Promise<Array<{ id: string; providerId: string; providerName: string; url: string; accountLabel?: string; accountKey?: string; createdAt: number; updatedAt: number; hasPrompt: boolean }>>
      listProviderMatrix(): Promise<Array<{ providerId: string; providerName: string; supportsPromptInput: boolean; supportsResponseRead: boolean; supportsModelSelection: boolean; supportedEntryUrls: string[]; notes: string[] }>>
      setSessionModel(sessionId: string, model: string): Promise<ToolResult>

      // Webview Management
      createWebview(config: WebviewConfig): Promise<{ success: boolean; partition: string; error?: string }>
      injectScript(slotId: string, script: string): Promise<ToolResult>
      sendPrompt(slotId: string, prompt: string, provider: string): Promise<ToolResult>
      readResponse(slotId: string): Promise<ToolResult>
      destroyWebview(slotId: string): Promise<{ success: boolean }>
      clearSession(slotId: string): Promise<ToolResult>
      registerWebview(slotId: string, webContentsId: number): Promise<{ success: boolean }>

      // Browser Sessions
      browserOpen(payload: { providerId: string; url: string; sessionId?: string; providerName?: string; forceNew?: boolean; accountLabel?: string; accountKey?: string; model?: string }): Promise<{ sessionId?: string; providerId?: string; url?: string; status?: string; error?: string }>
      browserSend(sessionId: string, prompt: string): Promise<ToolResult>
      browserRead(sessionId: string): Promise<{ content?: string; status?: string; error?: string }>
      browserClose(sessionId: string): Promise<ToolResult>
      browserClear(sessionId: string): Promise<ToolResult>
      browserCloseAll(): Promise<ToolResult>
      browserList(): Promise<Array<{ id: string; providerId: string; providerName: string; url: string; accountLabel?: string; accountKey?: string; createdAt: number; updatedAt: number; hasPrompt: boolean }>>

      // Tools
      fsRead(filePath: string): Promise<ToolResult>
      fsWrite(filePath: string, content: string): Promise<ToolResult>
      fsList(dirPath: string): Promise<ToolResult>
      shell(command: string): Promise<ToolResult>
      clipboardRead(): Promise<ToolResult>
      clipboardWrite(text: string): Promise<ToolResult>

      // Workflow
      loadWorkflow(name: string): Promise<ToolResult>
      saveWorkflow(name: string, content: string): Promise<ToolResult>
      listWorkflows(): Promise<ToolResult>

      // Agent Coordination
      broadcastToAgents(slotIds: string[], prompt: string): Promise<ToolResult>

      // Chrome Profile Management
      listChromeProfiles(): Promise<ToolResult>
      importChromeCookies(slotId: string, profilePath: string): Promise<ToolResult>

      // Event Listeners
      onWorkflowProgress(callback: (data: { nodeId: string; status: string; result?: unknown }) => void): () => void
      onWebviewUpdate(callback: (data: { slotId: string; event: string; data?: unknown }) => void): () => void
    }
  }
}

export {}
