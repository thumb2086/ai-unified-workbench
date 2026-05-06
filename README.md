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

```bash
npm install
```

### 網頁版（Vite 開發伺服器）
```bash
npm run dev
```
- 前端：http://localhost:5173

### Electron 桌面版
```bash
npm run dev:electron
```
- 同時啟動 Vite 開發伺服器 + Electron 視窗
- 注意：開發模式下 Node API 可直接暴露給渲染程序，生產環境需注意安全設定

### 前後端分離（含 API 自動化）
終端機 1：
```bash
npm run server  # 後端 (port 3001)
```
終端機 2：
```bash
npm run dev     # 前端 (port 5173)
```

或使用 concurrently（同時啟動）：
```bash
npm run dev:full
```

## 指令總覽

| 指令 | 說明 |
|------|------|
| `npm run dev` | Vite 開發伺服器 |
| `npm run dev:electron` | Vite + Electron |
| `npm run server` | 後端 API 伺服器 |
| `npm run dev:full` | 前後端同時啟動 |
| `npm run typecheck` | 類型檢查 |
| `npm run test` | 執行測試 |
| `npm run build` | 建置前端 + Electron |

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