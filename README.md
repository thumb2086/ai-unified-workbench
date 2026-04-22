# AI 統一工作台

這是一個單頁多 AI 工作台，目標是整合多家網頁版 AI，支援比較、協作與代理式任務分派。

## 支援的網頁版 AI
- OpenAI / ChatGPT
- Gemini
- Claude
- Grok

## 啟動方式
在專案目錄執行：
```bash
npm install
npm run dev
```

然後打開終端機提供的網址，通常是 `http://localhost:5173`。

Windows 也可以直接雙擊：
```bash
run-dev.bat
```

## 目前功能
- 三欄式工作台
- AI 勾選與網站開啟
- 模式切換
- 任務建立與儲存
- 模板管理
- 回覆貼上與摘要生成
- Markdown 匯出
- 本地 localStorage 保存

## 注意
這版先做「工作台與流程管理」，各家 AI 網頁仍需使用者自己登入並手動貼回回覆。
