// Use require for CommonJS compatibility
const { app, BrowserWindow, ipcMain } = require('electron')
import { join } from 'node:path'
import { registerIpcHandlers, registerWebview } from './ipc-handlers'

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0b0f19',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // Allow embedding AI sites
      allowRunningInsecureContent: true,
      webviewTag: true
    }
  })

  win.webContents.on('will-attach-webview', (_event: any, webPreferences: any) => {
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = false
  })

  // Handle webview attachment
  win.webContents.on('did-attach-webview', (_: any, wc: any) => {
    wc.setWindowOpenHandler(({ url }: { url: string }) => ({ action: 'allow', overrideBrowserWindowOptions: { show: false } }))
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }

  return win
}

// Register IPC handlers before app ready
registerIpcHandlers()

// Additional IPC for webview registration from renderer
ipcMain.handle('webview:register', (_event: any, slotId: string, webContentsId: number) => {
  registerWebview(slotId, webContentsId)
  return { success: true }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Security: Prevent new window creation
app.on('web-contents-created', (_: any, contents: any) => {
  contents.on('new-window', (event: any) => {
    event.preventDefault()
  })
})
