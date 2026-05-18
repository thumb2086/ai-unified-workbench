# AI Unified Workbench

Desktop AI workbench built with Electron + React. This version uses a Puppeteer-controlled browser session layer instead of embedded `webview` execution, and the workflow blueprint editor is now form-first instead of canvas-first.

## What Changed

- Browser automation now runs through **Puppeteer-controlled Chrome sessions**
- Browser sessions use **dedicated persistent profiles**
- The old drag-heavy blueprint canvas has been replaced by a **step form builder**
- Blueprints now support:
  - template selection
  - ordered step editing
  - AI node assignment
  - JSON/YAML generated preview
  - direct execution from the same screen
- GitHub Actions can build **Windows, macOS, and Linux** artifacts

## How To Open The App

### Development

1. Install dependencies:

```bash
npm install
```

2. Start the desktop app in development:

```bash
npm run dev:electron
```

This launches:

- Vite dev server for the renderer
- Electron for the desktop shell

### Optional API Server

If you still need the local Node API from the older architecture:

```bash
npm run server
```

### Packaged Build

Build the desktop app:

```bash
npm run build
```

Artifacts are written to:

```text
release/
```

Open the generated app for your platform from that folder:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: `.AppImage`

## Browser Session Architecture

Web AI providers such as ChatGPT, Gemini, Claude, and Grok are opened in Puppeteer-controlled Chrome windows.

### First Run

When you open a browser session for a provider:

1. The app launches Chrome through Puppeteer
2. A dedicated profile folder is created under:

```text
.browser-profiles/
```

3. You can log in normally in that Chrome window
4. The session stays reusable for later runs unless you clear its profile

### Session Controls

From the `Web` tab you can:

- open/focus a session
- force a new session
- send a prompt
- read the latest response
- set a preferred browser-side model name
- close a session
- clear the stored browser profile

## Provider Support Matrix

The app now exposes a provider support matrix for ChatGPT, Gemini, Claude, and Grok. It tracks:

- known entry URLs
- prompt input selector support
- response read selector support
- best-effort model switching hooks

Model switching is currently **best-effort**. The selector registry is wired up, but live authenticated DOM verification still needs to be completed provider by provider.

## Blueprint Builder

The `Workflow` tab is now a form-first blueprint editor.

### Built-in Templates

- `Simple Prompt Chain`
- `Broadcast`
- `Relay`
- `Debate`
- `Subagent`

### Editing Model

Each blueprint is edited as ordered steps. Each step can be one of:

- `prompt`
- `agent`
- `tool`
- `condition`
- `merge`
- `output`

For each step you can configure:

- title
- description
- prompt
- AI node / provider
- tool params
- condition branches
- dependencies
- output variable

### Preview

The builder generates a workflow definition preview in:

- `JSON`
- `YAML`

### Legacy Workflows

Previously stored graph workflows are migrated into the step-based form model when possible. If a workflow cannot be safely migrated, it is treated as legacy data.

## Project Structure

```text
electron/
  main/
    browser-automation-service.ts   # Puppeteer browser session service
    ipc-handlers.ts                 # Main-process IPC
  preload/
    index.ts                        # Renderer API bridge

src/renderer/src/
  components/webview/WebviewPool.tsx      # Browser control center
  pages/WorkflowBlueprintPage.tsx         # Form-first blueprint builder
  services/api.ts                         # Renderer-side browser/API helpers
  types/workbench.ts                      # Blueprint + workbench models
```

## GitHub Actions

The repository includes a matrix workflow that builds:

- Windows
- macOS
- Linux

Each run uploads the packaged artifacts so they can be downloaded directly from the workflow run.

## Notes

- The desktop shell is still Electron.
- The product scope is still a multi-AI workbench.
- Browser automation is no longer intended to rely on embedded webviews.
- If a provider changes its DOM structure, its selector config in the browser automation service may need updating.
