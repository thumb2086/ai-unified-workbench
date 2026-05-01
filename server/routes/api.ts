import { Router } from 'express'
import axios from 'axios'
import type { ChatRequest, ChatResponse } from '../types'
import { getAdapter } from '../services/api-adapters'

const router = Router()

router.post('/chat', async (req, res) => {
  const { providerId, baseUrl, apiKey, model, apiFormat, prompt, messages, headers } = req.body as ChatRequest

  if (!baseUrl || !model || !prompt) {
    return res.status(400).json({ error: 'Missing required fields: baseUrl, model, prompt' })
  }

  try {
    const adapter = getAdapter(apiFormat || 'openai')
    const requestBody = adapter.formatRequest({ providerId, baseUrl, apiKey, model, apiFormat, prompt, messages, headers })

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
          ...(headers || {}),
        },
        timeout: 60000,
      }
    )

    const result = adapter.parseResponse(response.data)
    res.json(result)
  } catch (error: any) {
    console.error('API Error:', error.message)
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'API request failed',
        details: error.response.data,
      })
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    })
  }
})

// 测试连接
router.post('/test', async (req, res) => {
  const { baseUrl, apiKey, headers } = req.body

  try {
    const response = await axios.get(
      `${baseUrl}/models`,
      {
        headers: {
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
          ...(headers || {}),
        },
        timeout: 10000,
      }
    )
    
    res.json({ status: 'ok', models: response.data.data || response.data })
  } catch (error: any) {
    res.status(500).json({
      error: 'Connection failed',
      message: error.message,
    })
  }
})

export default router
