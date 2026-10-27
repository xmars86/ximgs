import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { log } from './runtime/logger'
import { getAppIconPath } from './runtime/brand'

export function createMainWindow(): BrowserWindow {
  const icon = getAppIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'xImgs',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    log.info('Loaded renderer URL', { url: process.env['ELECTRON_RENDERER_URL'] })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
