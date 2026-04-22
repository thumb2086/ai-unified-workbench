import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('aiWorkbench', {
  version: '0.1.0'
})

declare global {
  interface Window {
    aiWorkbench: {
      version: string
    }
  }
}