import { useCallback, useState } from 'react'
import { useStorage } from '../../hooks/useStorage'
import './ChatPanel.css'

const DEFAULT_PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', icon: '🤖' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', icon: '♊' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', icon: '🧠' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/', icon: '⚡' },
]

type ChatMode = 'broadcast' | 'relay' | 'debate'

interface Message {
  id: string
  provider: string
  content: string
  timestamp: number
  type: 'user' | 'assistant'
}

export function ChatPanel() {
  const [prompt, setPrompt] = useStorage('ai-workbench.chat.prompt', '')
  const [selectedProviders, setSelectedProviders] = useStorage<string[]>('ai-workbench.chat.providers', ['gemini'])
  const [isSending, setIsSending] = useState(false)
  const [mode, setMode] = useStorage<ChatMode>('ai-workbench.chat.mode', 'broadcast')
  const [messages, setMessages] = useStorage<Message[]>('ai-workbench.chat.messages', [])
  const [topic, setTopic] = useStorage('ai-workbench.chat.topic', '')

  const toggleProvider = (id: string) => {
    setSelectedProviders(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    )
  }

  // Broadcast mode: Send to all simultaneously
  const handleBroadcast = useCallback(async () => {
    if (!prompt.trim() || selectedProviders.length === 0) return

    setIsSending(true)
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      provider: 'user',
      content: prompt,
      timestamp: Date.now(),
      type: 'user'
    }
    setMessages(prev => [...prev, userMsg])
    
    try {
      // Send to all selected providers in parallel
      await Promise.all(selectedProviders.map(async (providerId) => {
        // Placeholder - actual would use IPC to send to webview
        console.log(`Broadcasting to ${providerId}:`, prompt)
        
        // Simulate response
        await new Promise(r => setTimeout(r, 2000))
        
        const responseMsg: Message = {
          id: `${providerId}-${Date.now()}`,
          provider: providerId,
          content: `[${providerId}] Response to: ${prompt}`,
          timestamp: Date.now(),
          type: 'assistant'
        }
        setMessages(prev => [...prev, responseMsg])
      }))
      
      setPrompt('')
    } finally {
      setIsSending(false)
    }
  }, [prompt, selectedProviders])

  // Relay mode: Chain responses from one AI to the next
  const handleRelay = useCallback(async () => {
    if (!prompt.trim() || selectedProviders.length === 0) return

    setIsSending(true)
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      provider: 'user',
      content: prompt,
      timestamp: Date.now(),
      type: 'user'
    }
    setMessages(prev => [...prev, userMsg])
    
    try {
      let currentPrompt = prompt
      
      for (const providerId of selectedProviders) {
        console.log(`Relay to ${providerId}:`, currentPrompt)
        
        // Simulate response
        await new Promise(r => setTimeout(r, 2000))
        
        const response = `[${providerId}] Response to: ${currentPrompt}`
        
        const responseMsg: Message = {
          id: `${providerId}-${Date.now()}`,
          provider: providerId,
          content: response,
          timestamp: Date.now(),
          type: 'assistant'
        }
        setMessages(prev => [...prev, responseMsg])
        
        // Pass response to next AI
        currentPrompt = `${currentPrompt}\n\n${providerId} said: ${response}`
      }
      
      setPrompt('')
    } finally {
      setIsSending(false)
    }
  }, [prompt, selectedProviders])

  // Debate mode: Multiple AIs discuss a topic
  const handleDebate = useCallback(async () => {
    if (!topic.trim() || selectedProviders.length < 2) {
      alert('Debate mode requires at least 2 providers and a topic')
      return
    }

    setIsSending(true)
    setMessages([])
    
    try {
      // Round 1: Opening statements
      for (const providerId of selectedProviders) {
        const openingPrompt = `Debate Topic: ${topic}\n\nYou are ${providerId}. Give your opening argument on this topic (be concise).`
        
        console.log(`Debate opening for ${providerId}`)
        await new Promise(r => setTimeout(r, 3000))
        
        const responseMsg: Message = {
          id: `${providerId}-opening-${Date.now()}`,
          provider: providerId,
          content: `[${providerId}] Opening: I believe ${topic} is important because...`,
          timestamp: Date.now(),
          type: 'assistant'
        }
        setMessages(prev => [...prev, responseMsg])
      }
      
      // Round 2: Rebuttals
      for (let i = 0; i < selectedProviders.length; i++) {
        const providerId = selectedProviders[i]
        const rebuttalPrompt = `Debate Topic: ${topic}\n\nAs ${providerId}, provide a brief rebuttal to the other arguments.`
        
        console.log(`Debate rebuttal for ${providerId}`)
        await new Promise(r => setTimeout(r, 3000))
        
        const responseMsg: Message = {
          id: `${providerId}-rebuttal-${Date.now()}`,
          provider: providerId,
          content: `[${providerId}] Rebuttal: While others argue..., I counter that...`,
          timestamp: Date.now(),
          type: 'assistant'
        }
        setMessages(prev => [...prev, responseMsg])
      }
    } finally {
      setIsSending(false)
    }
  }, [topic, selectedProviders])

  const handleSend = useCallback(() => {
    switch (mode) {
      case 'broadcast':
        handleBroadcast()
        break
      case 'relay':
        handleRelay()
        break
      case 'debate':
        handleDebate()
        break
    }
  }, [mode, handleBroadcast, handleRelay, handleDebate])

  return (
    <div className="chat-panel">
      <div className="chat-sidebar">
        <h3>AI Providers</h3>
        <div className="provider-list">
          {DEFAULT_PROVIDERS.map(provider => (
            <label key={provider.id} className="provider-checkbox">
              <input
                type="checkbox"
                checked={selectedProviders.includes(provider.id)}
                onChange={() => toggleProvider(provider.id)}
              />
              <span className="provider-icon">{provider.icon}</span>
              <span className="provider-name">{provider.name}</span>
            </label>
          ))}
        </div>
        
        <div className="quick-actions">
          <button onClick={() => setSelectedProviders(DEFAULT_PROVIDERS.map(p => p.id))}>
            Select All
          </button>
          <button onClick={() => setSelectedProviders([])}>
            Clear All
          </button>
        </div>
      </div>

      <div className="chat-main">
        <div className="chat-header">
          <div className="mode-selector">
            <button 
              className={`mode-btn ${mode === 'broadcast' ? 'active' : ''}`}
              onClick={() => setMode('broadcast')}
              title="Send to all simultaneously"
            >
              📢 Broadcast
            </button>
            <button 
              className={`mode-btn ${mode === 'relay' ? 'active' : ''}`}
              onClick={() => setMode('relay')}
              title="Chain responses from one to next"
            >
              🔗 Relay
            </button>
            <button 
              className={`mode-btn ${mode === 'debate' ? 'active' : ''}`}
              onClick={() => setMode('debate')}
              title="AIs discuss a topic"
            >
              💬 Debate
            </button>
          </div>
          <span className="selected-count">
            {selectedProviders.length} AI(s) selected
          </span>
        </div>

        <div className="chat-input-area">
          {mode === 'debate' ? (
            <>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter debate topic..."
                className="topic-input"
              />
              <p className="mode-hint">Debate mode: Selected AIs will discuss the topic with opening arguments and rebuttals.</p>
            </>
          ) : (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === 'broadcast' 
                ? "Enter your prompt here... This will be sent to all selected AI providers simultaneously."
                : "Enter your prompt here... It will be sent to the first AI, then responses will be chained to the next AI."
              }
              rows={6}
            />
          )}
          <div className="input-actions">
            <button 
              className="btn-send"
              onClick={handleSend}
              disabled={isSending || selectedProviders.length === 0 || (mode === 'debate' ? !topic.trim() : !prompt.trim())}
            >
              {isSending 
                ? (mode === 'debate' ? 'Discussing...' : mode === 'relay' ? 'Chaining...' : 'Sending...')
                : (mode === 'debate' ? 'Start Debate' : mode === 'relay' ? 'Start Relay' : 'Send to All')
              }
            </button>
            <button 
              className="btn-clear"
              onClick={() => { setPrompt(''); setTopic(''); setMessages([]); }}
              disabled={isSending}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="chat-messages">
          <h4>Messages</h4>
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="messages-placeholder">
                <p>No messages yet.</p>
                <p>Select providers and send a message to get started.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`message ${msg.type === 'user' ? 'user-message' : 'ai-message'}`}
                >
                  <div className="message-header">
                    <span className="message-provider">
                      {msg.type === 'user' ? '👤 You' : DEFAULT_PROVIDERS.find(p => p.id === msg.provider)?.icon + ' ' + msg.provider}
                    </span>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
