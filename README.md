# AI 統一工作台 v0.3

單頁多 AI 工作台，整合網頁版 AI 與 API 服務，支援比較、協作與代理式任務分派。

## 支援的 AI 服務

### 網頁版（手動/半自動）
- ChatGPT
- Gemini
- Claude
- Grok

### API 版（自動）
- OpenAI
- OpenRouter
- NVIDIA NIM
- 自訂 API（OpenAI compatible）

## 啟動方式

### 僅前端（手動模式）
```bash
npm install
npm run dev
```

### 前後端一起（含 API 自動化）
```bash
npm install
npm run server  # 終端機 1：啟動後端 (port 3001)
npm run dev     # 終端機 2：啟動前端 (port 5173)
```

或使用 concurrently（同時啟動）：
```bash
npm run dev:full
```

## 主要功能
- **Provider 管理**：自訂 API 網址、API Key、模型名稱
- **三欄式布局**：AI 選擇 | Prompt 編輯 | 回覆彙總
- **多 API 格式**：OpenAI、NVIDIA NIM、Anthropic、自訂格式
- **網頁自動化**：Playwright 操作瀏覽器
- **Markdown 匯出**
- **本地儲存**：localStorage 保存任務與設定

## 專案結構
```
ai-unified-workbench/
├── src/renderer/        # 前端 React
│   ├── components/      # UI 組件
│   ├── hooks/           # 自定義 hooks
│   ├── types/           # TypeScript 類型
│   └── App.tsx          # 主應用
├── server/              # Node.js 後端
│   ├── routes/api.ts    # API 代理
│   ├── routes/browser.ts # Playwright 瀏覽器控制
│   └── services/api-adapters.ts # API 格式轉換
└── package.json
```

## API 格式說明

| 格式 | 說明 | 端點 |
|------|------|------|
| `openai` | 標準 OpenAI | `/v1/chat/completions` |
| `nvidia-nim` | NVIDIA NIM | `/v1/chat/completions` |
| `anthropic` | Claude API | `/v1/messages` |
| `custom` | 自訂解析 | 自動推斷 |
