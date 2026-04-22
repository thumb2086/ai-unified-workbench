import { useEffect, useMemo, useState } from 'react'

type ProviderId = 'openai' | 'gemini' | 'claude' | 'grok'
type Mode = '比較模式' | '協作模式' | '代理模式'
type TaskStatus = 'draft' | 'active' | 'done' | 'archived'

type Provider = {
  id: ProviderId
  name: string
  label: string
  url: string
  status: 'online' | 'offline'
  note: string
}

type TaskResponse = {
  providerId: ProviderId
  content: string
  updatedAt: string
}

type Task = {
  id: string
  title: string
  prompt: string
  mode: Mode
  status: TaskStatus
  providerIds: ProviderId[]
  createdAt: string
  updatedAt: string
  responses: TaskResponse[]
  summary: string
}

type Template = {
  id: string
  title: string
  content: string
  createdAt: string
}

type Activity = {
  id: string
  text: string
  at: string
}

type AppState = {
  tasks: Task[]
  templates: Template[]
  activities: Activity[]
  selectedTaskId: string | null
}

const STORAGE_KEY = 'ai-workbench.v2'
const initialPrompt = '請幫我規劃這個單頁多 AI 工作台的第一版功能，包含頁面結構、資料流和下一步開發順序。'
const modes: Mode[] = ['比較模式', '協作模式', '代理模式']

const providers: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    status: 'online',
    note: 'OpenAI 網頁版',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    label: 'Google Gemini',
    url: 'https://gemini.google.com/app',
    status: 'online',
    note: 'Google Gemini 網頁版',
  },
  {
    id: 'claude',
    name: 'Claude',
    label: 'Anthropic Claude',
    url: 'https://claude.ai/new',
    status: 'online',
    note: 'Anthropic Claude 網頁版',
  },
  {
    id: 'grok',
    name: 'Grok',
    label: 'xAI Grok',
    url: 'https://grok.com/',
    status: 'online',
    note: 'xAI Grok 網頁版',
  },
]

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function now() {
  return new Date().toISOString()
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('zh-Hant', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function createSeedTask(): Task {
  const timestamp = now()
  return {
    id: uid('task'),
    title: '第一個任務',
    prompt: initialPrompt,
    mode: '比較模式',
    status: 'active',
    providerIds: ['openai', 'gemini', 'claude'],
    createdAt: timestamp,
    updatedAt: timestamp,
    responses: [],
    summary: '',
  }
}

function createSeedState(): AppState {
  const task = createSeedTask()
  return {
    tasks: [task],
    templates: [
      {
        id: uid('tpl'),
        title: '比較模式：同題多 AI',
        content: '請比較 OpenAI、Gemini、Claude 對同一個問題的回答差異。',
        createdAt: now(),
      },
      {
        id: uid('tpl'),
        title: '協作模式：分工寫作',
        content: '請由一個 AI 產生初稿、另一個 AI 校對、第三個 AI 整理成最終版本。',
        createdAt: now(),
      },
    ],
    activities: [
      { id: uid('act'), text: '建立預設任務與模板。', at: now() },
    ],
    selectedTaskId: task.id,
  }
}

function loadState(): AppState {
  if (typeof window === 'undefined') return createSeedState()
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return createSeedState()
  try {
    return JSON.parse(raw) as AppState
  } catch {
    return createSeedState()
  }
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function buildSummary(task: Task, providerMap: Map<ProviderId, Provider>) {
  const responses = task.responses.map((response) => response.content.trim()).filter(Boolean)
  if (!responses.length) return '尚未填寫回答。可先開啟各家網頁版 AI，將結果貼回來。'

  const allWords = responses.flatMap(normalizeText)
  const wordFreq = new Map<string, number>()
  for (const word of allWords) {
    if (word.length < 2) continue
    wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
  }

  const topKeywords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word)

  const lengths = task.responses.map((response) => {
    const providerName = providerMap.get(response.providerId)?.name ?? response.providerId
    return `- ${providerName}: ${response.content.length} 字`
  })

  return [
    '摘要：',
    ...(topKeywords.length ? topKeywords.map((word) => `- 反覆出現的主題：${word}`) : ['- 回覆內容可再整理成更明確的結論。']),
    '',
    '比較重點：',
    ...lengths,
  ].join('\n')
}

function providerNames(ids: ProviderId[]) {
  return ids.map((id) => providers.find((provider) => provider.id === id)?.name ?? id).join('、')
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [title, setTitle] = useState('第一個任務')
  const [prompt, setPrompt] = useState(initialPrompt)
  const [mode, setMode] = useState<Mode>('比較模式')
  const [selectedProviderIds, setSelectedProviderIds] = useState<ProviderId[]>(['openai', 'gemini', 'claude'])
  const [activeTab, setActiveTab] = useState<'task' | 'tasks' | 'history'>('task')
  const [templateTitle, setTemplateTitle] = useState('')
  const [responseDrafts, setResponseDrafts] = useState<Record<ProviderId, string>>({
    openai: '',
    gemini: '',
    claude: '',
    grok: '',
  })

  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider] as const)), [])
  const selectedTask = useMemo(() => {
    return state.tasks.find((task) => task.id === state.selectedTaskId) ?? state.tasks[0] ?? null
  }, [state.tasks, state.selectedTaskId])
  const selectedProviders = providers.filter((provider) => selectedProviderIds.includes(provider.id))

  useEffect(() => {
    if (!selectedTask) return
    setTitle(selectedTask.title)
    setPrompt(selectedTask.prompt)
    setMode(selectedTask.mode)
    setSelectedProviderIds(selectedTask.providerIds)
    const nextDrafts: Record<ProviderId, string> = {
      openai: '',
      gemini: '',
      claude: '',
      grok: '',
    }
    for (const response of selectedTask.responses) {
      nextDrafts[response.providerId] = response.content
    }
    setResponseDrafts(nextDrafts)
  }, [selectedTask?.id])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  function addActivity(text: string) {
    setState((current) => ({
      ...current,
      activities: [{ id: uid('act'), text, at: now() }, ...current.activities].slice(0, 40),
    }))
  }

  function updateSelectedTask(updater: (task: Task) => Task) {
    if (!selectedTask) return
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === selectedTask.id ? updater(task) : task)),
    }))
  }

  function createTask() {
    const timestamp = now()
    const task: Task = {
      id: uid('task'),
      title: title.trim() || '未命名任務',
      prompt: prompt.trim() || initialPrompt,
      mode,
      status: 'active',
      providerIds: selectedProviderIds,
      createdAt: timestamp,
      updatedAt: timestamp,
      responses: [],
      summary: '',
    }
    setState((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      selectedTaskId: task.id,
    }))
    addActivity(`建立任務「${task.title}」。`)
  }

  function saveTask() {
    updateSelectedTask((task) => ({
      ...task,
      title: title.trim() || '未命名任務',
      prompt: prompt.trim() || initialPrompt,
      mode,
      providerIds: selectedProviderIds,
      updatedAt: now(),
    }))
    addActivity(`儲存任務「${title.trim() || '未命名任務'}」。`)
  }

  function selectTask(taskId: string) {
    setState((current) => ({ ...current, selectedTaskId: taskId }))
  }

  function toggleProvider(providerId: ProviderId) {
    setSelectedProviderIds((current) =>
      current.includes(providerId) ? current.filter((id) => id !== providerId) : [...current, providerId],
    )
  }

  function openWebsite(providerId: ProviderId) {
    const provider = providerMap.get(providerId)
    if (!provider) return
    window.open(provider.url, '_blank', 'noopener,noreferrer')
    addActivity(`開啟 ${provider.name} 網頁版。`)
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt)
    addActivity('已複製目前提示詞。')
  }

  function saveTemplate() {
    const content = prompt.trim()
    if (!content) return
    const template: Template = {
      id: uid('tpl'),
      title: templateTitle.trim() || content.slice(0, 30),
      content,
      createdAt: now(),
    }
    setState((current) => ({
      ...current,
      templates: [template, ...current.templates],
    }))
    setTemplateTitle('')
    addActivity(`儲存模板「${template.title}」。`)
  }

  function loadTemplate(content: string) {
    setPrompt(content)
    addActivity('已載入模板。')
  }

  function deleteTemplate(id: string) {
    setState((current) => ({
      ...current,
      templates: current.templates.filter((template) => template.id !== id),
    }))
    addActivity('刪除一筆模板。')
  }

  function saveResponse(providerId: ProviderId) {
    if (!selectedTask) return
    const content = responseDrafts[providerId].trim()
    if (!content) return
    updateSelectedTask((task) => {
      const responses = task.responses.filter((response) => response.providerId !== providerId)
      const nextTask: Task = {
        ...task,
        responses: [...responses, { providerId, content, updatedAt: now() }],
        updatedAt: now(),
      }
      nextTask.summary = buildSummary(nextTask, providerMap)
      return nextTask
    })
    addActivity(`儲存 ${providerMap.get(providerId)?.name ?? providerId} 回覆。`)
  }

  function fillDemoResponses() {
    setResponseDrafts({
      openai: 'OpenAI：建議先確定 MVP 邊界，再把 UI、資料模型與工作流程拆開。',
      gemini: 'Gemini：可以先做三欄式布局，左側列出 AI，中間輸入，右側比較結果。',
      claude: 'Claude：先做好任務管理與摘要生成，再進一步考慮更複雜的自動化。',
      grok: 'Grok：本地保存、模板管理與手動匯出會是很實用的第一步。',
    })
    addActivity('已填入示範回覆。')
  }

  function generateSummary() {
    if (!selectedTask) return
    updateSelectedTask((task) => ({
      ...task,
      summary: buildSummary(task, providerMap),
      updatedAt: now(),
    }))
    addActivity('已生成摘要。')
  }

  function exportMarkdown() {
    if (!selectedTask) return
    const summaryText = selectedTask.summary || buildSummary(selectedTask, providerMap)
    const content = [
      `# ${selectedTask.title}`,
      '',
      `- 模式：${selectedTask.mode}`,
      `- 狀態：${selectedTask.status}`,
      `- 建立時間：${formatTime(selectedTask.createdAt)}`,
      `- 更新時間：${formatTime(selectedTask.updatedAt)}`,
      `- AI：${providerNames(selectedTask.providerIds)}`,
      '',
      '## 提示詞',
      selectedTask.prompt,
      '',
      '## 回覆',
      ...selectedTask.responses.map(
        (response) => `### ${providerMap.get(response.providerId)?.name ?? response.providerId}\n\n${response.content}`,
      ),
      '',
      '## 摘要',
      summaryText,
    ].join('\n')

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedTask.title || 'ai-task'}.md`
    a.click()
    URL.revokeObjectURL(url)
    addActivity('已匯出 Markdown。')
  }

  function resetDemo() {
    const next = createSeedState()
    setState(next)
    addActivity('已重置成示範資料。')
  }

  const summary = selectedTask ? selectedTask.summary || buildSummary(selectedTask, providerMap) : ''

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">AI 統一工作台</div>
          <h1>單頁多 AI 工作台</h1>
          <p className="subtitle">支援 OpenAI、Gemini、Claude、Grok 的工作流編排與比較</p>
        </div>
        <div className="topbar-actions">
          {modes.map((item) => (
            <button key={item} className={item === mode ? 'primary' : ''} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
          <button onClick={copyPrompt}>複製提示詞</button>
          <button onClick={generateSummary}>生成摘要</button>
          <button onClick={exportMarkdown}>匯出 Markdown</button>
          <button onClick={resetDemo}>重置資料</button>
        </div>
      </header>

      <main className="layout">
        <aside className="panel sidebar">
          <h2>AI 清單</h2>
          <div className="provider-list">
            {providers.map((provider) => {
              const active = selectedProviderIds.includes(provider.id)
              return (
                <div key={provider.id} className={`provider-card ${active ? 'active' : ''}`}>
                  <label className="provider-title">
                    <input type="checkbox" checked={active} onChange={() => toggleProvider(provider.id)} />
                    <strong>{provider.name}</strong>
                    <span className="badge">{provider.label}</span>
                  </label>
                  <div className={`status ${provider.status}`}>{provider.status === 'online' ? '可用' : '離線'}</div>
                  <div className="subtle">{provider.note}</div>
                  <div className="provider-actions">
                    <button onClick={() => openWebsite(provider.id)}>開啟網站</button>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(provider.url)
                        addActivity(`已複製 ${provider.name} 網址。`)
                      }}
                    >
                      複製連結
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <h2>模板</h2>
          <div className="template-form">
            <input value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} placeholder="模板名稱" />
            <button className="primary" onClick={saveTemplate}>
              儲存目前提示詞
            </button>
          </div>
          <div className="template-list">
            {state.templates.length ? (
              state.templates.map((template) => (
                <div key={template.id} className="template-card">
                  <button className="template-btn" onClick={() => loadTemplate(template.content)}>
                    {template.title}
                  </button>
                  <div className="template-meta">{formatTime(template.createdAt)}</div>
                  <button onClick={() => deleteTemplate(template.id)}>刪除</button>
                </div>
              ))
            ) : (
              <div className="card muted">尚未建立模板</div>
            )}
          </div>
        </aside>

        <section className="panel center">
          <div className="section-head">
            <h2>任務編排</h2>
            <div className="badge-row">
              <span className="badge">目前模式：{mode}</span>
              <span className="badge">已選：{selectedProviders.length} 個 AI</span>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>任務標題</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任務標題" />
            </label>
            <label>
              <span>模式</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                {modes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="textarea-block">
            <span>統一提示詞</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="輸入要交給多個 AI 的問題或任務..." />
          </label>

          <div className="row wrap">
            <button className="primary" onClick={createTask}>
              建立任務
            </button>
            <button onClick={saveTask}>儲存任務</button>
            <button onClick={fillDemoResponses}>填入示範回覆</button>
            <button onClick={generateSummary}>生成摘要</button>
          </div>

          <div className="card">
            <h3>目前任務</h3>
            {selectedTask ? (
              <>
                <p>
                  {selectedTask.title} · {selectedTask.mode} · {providerNames(selectedTask.providerIds)}
                </p>
                <p className="muted">
                  建立：{formatTime(selectedTask.createdAt)}｜更新：{formatTime(selectedTask.updatedAt)}
                </p>
              </>
            ) : (
              <p className="muted">尚未建立任務</p>
            )}
          </div>

          <div className="card">
            <h3>回覆編輯</h3>
            <div className="response-grid">
              {selectedProviderIds.length ? (
                selectedProviderIds.map((providerId) => {
                  const provider = providerMap.get(providerId)
                  if (!provider) return null
                  return (
                    <div key={providerId} className="response-card">
                      <div className="response-head">
                        <strong>{provider.name}</strong>
                        <button onClick={() => openWebsite(providerId)}>開啟網站</button>
                      </div>
                      <textarea
                        value={responseDrafts[providerId]}
                        onChange={(e) =>
                          setResponseDrafts((current) => ({ ...current, [providerId]: e.target.value }))
                        }
                        placeholder={`貼上 ${provider.name} 的回覆...`}
                      />
                      <div className="row wrap">
                        <button className="primary" onClick={() => saveResponse(providerId)}>
                          儲存回覆
                        </button>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(prompt)
                            addActivity(`已複製給 ${provider.name} 的提示詞。`)
                          }}
                        >
                          複製提示詞
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="muted">請先勾選至少一個 AI。</div>
              )}
            </div>
          </div>
        </section>

        <aside className="panel sidebar">
          <div className="tabs">
            <button className={activeTab === 'task' ? 'primary' : ''} onClick={() => setActiveTab('task')}>
              匯總
            </button>
            <button className={activeTab === 'tasks' ? 'primary' : ''} onClick={() => setActiveTab('tasks')}>
              任務
            </button>
            <button className={activeTab === 'history' ? 'primary' : ''} onClick={() => setActiveTab('history')}>
              活動
            </button>
          </div>

          {activeTab === 'task' && (
            <>
              <h2>比較 / 匯總</h2>
              {selectedTask ? (
                <>
                  <div className="summary-box">
                    <h3>摘要</h3>
                    <pre>{summary}</pre>
                  </div>
                  <div className="card">
                    <h3>已保存回覆</h3>
                    {selectedTask.responses.length ? (
                      selectedTask.responses.map((response) => (
                        <div key={response.providerId} className="mini-response">
                          <strong>{providerMap.get(response.providerId)?.name ?? response.providerId}</strong>
                          <p>{response.content}</p>
                          <div className="subtle">更新：{formatTime(response.updatedAt)}</div>
                        </div>
                      ))
                    ) : (
                      <p className="muted">尚未保存任何回覆。</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="card muted">尚未選擇任務</div>
              )}
            </>
          )}

          {activeTab === 'tasks' && (
            <>
              <h2>任務列表</h2>
              <div className="task-list">
                {state.tasks.map((task) => (
                  <div key={task.id} className={`task-card ${task.id === selectedTask?.id ? 'active' : ''}`}>
                    <button className="task-title" onClick={() => selectTask(task.id)}>
                      {task.title}
                    </button>
                    <div className="subtle">{task.mode} · {providerNames(task.providerIds)}</div>
                    <div className="subtle">{formatTime(task.updatedAt)}</div>
                    <div className="row wrap">
                      <button onClick={() => selectTask(task.id)}>開啟</button>
                      <button
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            tasks: current.tasks.map((item) =>
                              item.id === task.id ? { ...item, status: 'done', updatedAt: now() } : item,
                            ),
                          }))
                        }
                      >
                        完成
                      </button>
                      <button
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            tasks: current.tasks.filter((item) => item.id !== task.id),
                            selectedTaskId: current.selectedTaskId === task.id ? current.tasks[0]?.id ?? null : current.selectedTaskId,
                          }))
                        }
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'history' && (
            <>
              <h2>活動紀錄</h2>
              <div className="activity-list">
                {state.activities.length ? (
                  state.activities.map((activity) => (
                    <div key={activity.id} className="activity-item">
                      <div>{activity.text}</div>
                      <div className="subtle">{formatTime(activity.at)}</div>
                    </div>
                  ))
                ) : (
                  <div className="card muted">目前沒有活動紀錄</div>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
