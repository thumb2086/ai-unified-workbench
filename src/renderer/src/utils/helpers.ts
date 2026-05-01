export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function now(): string {
  return new Date().toISOString()
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-Hant', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

export function normalizeText(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function buildSummary(responses: { providerId: string; content: string }[], providerMap: Map<string, { name: string }>): string {
  const validResponses = responses.filter(r => r.content.trim())
  if (!validResponses.length) return '尚未填寫回答。'

  const allWords = validResponses.flatMap(r => normalizeText(r.content))
  const wordFreq = new Map<string, number>()
  for (const word of allWords) {
    if (word.length < 2) continue
    wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
  }

  const topKeywords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word)

  const lengths = validResponses.map(r => {
    const providerName = providerMap.get(r.providerId)?.name ?? r.providerId
    return `- ${providerName}: ${r.content.length} 字`
  })

  return [
    '摘要：',
    ...(topKeywords.length ? topKeywords.map(word => `- 反覆出現的主題：${word}`) : ['- 回覆內容可再整理成更明確的結論。']),
    '',
    '比較重點：',
    ...lengths,
  ].join('\n')
}
