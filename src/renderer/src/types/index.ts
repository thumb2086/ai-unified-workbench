export type ApiFormat = 'openai' | 'nvidia-nim' | 'anthropic' | 'custom'
export type ProviderType = 'web' | 'api'
export type Mode = 'compare' | 'collaborate' | 'agent'
export type TaskStatus = 'draft' | 'active' | 'done' | 'archived'

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  apiFormat?: ApiFormat
  apiKey?: string
  baseUrl?: string
  model?: string
  headers?: Record<string, string>
  webUrl?: string
}

export interface TaskResponse {
  providerId: string
  content: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  prompt: string
  mode: Mode
  status: TaskStatus
  providerIds: string[]
  createdAt: string
  updatedAt: string
  responses: TaskResponse[]
  summary: string
}

export interface AppState {
  tasks: Task[]
  selectedTaskId: string | null
  providers: ProviderConfig[]
}
