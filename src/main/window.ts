import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { log } from './runtime/logger'
import { getAppIconPath } from './runtime/brand'

export interface CreateMainWindowOptions {
  /** When true, stay hidden after ready (tray / login-item start). */
  startHidden?: boolean
}

export function createMainWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
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
    if (options.startHidden) {
      log.info('Main window ready (start hidden → tray)')
      return
    }
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
