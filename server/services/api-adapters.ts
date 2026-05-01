import type { ApiFormat, ChatRequest, ChatResponse } from '../types'

export interface ApiAdapter {
  formatRequest: (req: ChatRequest) => unknown
  parseResponse: (response: unknown) => ChatResponse
}

// OpenAI 标准格式
const openaiAdapter: ApiAdapter = {
  formatRequest: (req) => ({
    model: req.model,
    messages: buildMessages(req),
    temperature: 0.7,
  }),
  parseResponse: (response: any) => ({
    content: response.choices?.[0]?.message?.content ?? '',
    usage: response.usage,
  }),
}

// NVIDIA NIM 格式
// NIM 使用 OpenAI 兼容格式，但可能有细微差别
const nvidiaNimAdapter: ApiAdapter = {
  formatRequest: (req) => ({
    model: req.model,
    messages: buildMessages(req),
    temperature: 0.7,
    max_tokens: 1024,
  }),
  parseResponse: (response: any) => ({
    content: response.choices?.[0]?.message?.content ?? 
            response.content ?? 
            response.text ?? 
            JSON.stringify(response),
    usage: response.usage,
  }),
}

// Anthropic Claude 格式
const anthropicAdapter: ApiAdapter = {
  formatRequest: (req) => ({
    model: req.model,
    messages: buildMessages(req),
    max_tokens: 1024,
  }),
  parseResponse: (response: any) => ({
    content: response.content?.[0]?.text ?? 
            response.completion ?? 
            response.choices?.[0]?.message?.content ?? 
            '',
    usage: response.usage,
  }),
}

// 自定义格式 - 尝试智能解析
const customAdapter: ApiAdapter = {
  formatRequest: (req) => ({
    model: req.model,
    messages: buildMessages(req),
  }),
  parseResponse: (response: any) => {
    // 尝试多种可能的响应格式
    const content = 
      response.choices?.[0]?.message?.content ??
      response.choices?.[0]?.text ??
      response.content ??
      response.text ??
      response.completion ??
      response.output ??
      response.result ??
      (typeof response === 'string' ? response : JSON.stringify(response))
    
    return {
      content,
      usage: response.usage,
    }
  },
}

export const adapters: Record<ApiFormat, ApiAdapter> = {
  'openai': openaiAdapter,
  'nvidia-nim': nvidiaNimAdapter,
  'anthropic': anthropicAdapter,
  'custom': customAdapter,
}

export function getAdapter(format: ApiFormat): ApiAdapter {
  return adapters[format] || adapters.custom
}

function buildMessages(req: ChatRequest) {
  if (req.messages && req.messages.length > 0) {
    return req.messages
  }

  return [{ role: 'user' as const, content: req.prompt }]
}
