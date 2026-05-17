// Use require for CommonJS compatibility
const { app, BrowserWindow } = require('electron')
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc-handlers'

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
      webSecurity: false,
      allowRunningInsecureContent: true
    }
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
