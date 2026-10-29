import { app, type BrowserWindow } from 'electron'
import { configurePackagedUserData, ensureRuntimeDirs } from './runtime/paths'
import { setupLogger, log } from './runtime/logger'
import {
  applyLoginItemSettings,
  getDesktopPrefs,
  loadConfig,
  shouldStartHidden
} from './runtime/config'
import { openDatabase, closeDatabase } from './db/client'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import { createMainWindow } from './window'
import {
  attachCloseToTray,
  createAppTray,
  destroyAppTray,
  markAppQuitting,
  showMainWindow
} from './tray'
import { installApplicationMenu } from './menu'
import {
  bootstrapLibraryDomain,
  registerMediaProtocolHandler,
  registerMediaSchemePrivileged
} from './domain/library'
import { bootstrapSyncDomain, shutdownSyncDomain } from './domain/sync'
import { applyPendingRestoreIfAny } from './domain/backup'

// Must run before app ready
registerMediaSchemePrivileged()
configurePackagedUserData()

// Electron on Windows: avoid GPU process crashes in some VMs
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

app.setName('xImgs')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ximgs.app')
}

let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function bindMainWindow(win: BrowserWindow): void {
  mainWindow = win
  attachCloseToTray(win)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      showMainWindow(win)
      return
    }
    bindMainWindow(createMainWindow({ startHidden: false }))
  })

  async function bootstrap(): Promise<void> {
    ensureRuntimeDirs()
    setupLogger()
    // Apply staged backup restore before opening SQLite.
    if (applyPendingRestoreIfAny()) {
      log.info('Pending backup restore applied before database open')
    }
    loadConfig()
    applyLoginItemSettings(getDesktopPrefs())
    await openDatabase()
    bootstrapLibraryDomain()
    bootstrapSyncDomain()
    registerMediaProtocolHandler()
    registerIpcHandlers()

    installApplicationMenu()
    const hidden = shouldStartHidden()
    bindMainWindow(createMainWindow({ startHidden: hidden }))
    createAppTray(getMainWindow)

    log.info('xImgs started', {
      version: app.getVersion(),
      userData: app.getPath('userData'),
      startHidden: hidden
    })
  }

  app.whenReady().then(() => {
    void bootstrap().catch((error) => {
      log.error('Bootstrap failed', error)
      markAppQuitting()
      app.quit()
    })

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        showMainWindow(mainWindow)
        return
      }
      bindMainWindow(createMainWindow({ startHidden: false }))
    })
  })

  // Fires only when the window is actually destroyed (closeToTray off, or Quit).
  app.on('window-all-closed', () => {
    markAppQuitting()
    destroyAppTray()
    app.quit()
  })

  app.on('before-quit', () => {
    markAppQuitting()
    destroyAppTray()
    shutdownSyncDomain()
    unregisterIpcHandlers()
    closeDatabase()
  })
}
