export type ApiFormat = 'openai' | 'nvidia-nim' | 'anthropic' | 'custom'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  providerId: string
  baseUrl: string
  apiKey?: string
  model: string
  apiFormat: ApiFormat
  prompt: string
  messages?: ChatMessage[]
  headers?: Record<string, string>
}

export interface ChatResponse {
  content: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export interface BrowserSession {
  id: string
  providerId: string
  pageUrl: string
  status: 'idle' | 'busy' | 'error'
}
