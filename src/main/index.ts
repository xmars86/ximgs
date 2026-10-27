import { app, BrowserWindow } from 'electron'
import { configurePackagedUserData, ensureRuntimeDirs } from './runtime/paths'
import { setupLogger, log } from './runtime/logger'
import { loadConfig } from './runtime/config'
import { openDatabase, closeDatabase } from './db/client'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import { createMainWindow } from './window'
import {
  bootstrapLibraryDomain,
  registerMediaProtocolHandler,
  registerMediaSchemePrivileged
} from './domain/library'
import { bootstrapSyncDomain, shutdownSyncDomain } from './domain/sync'

// Must run before app ready
registerMediaSchemePrivileged()
configurePackagedUserData()

// Electron on Windows: avoid GPU process crashes in some VMs
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

app.setName('xImgs')

let mainWindow: BrowserWindow | null = null

async function bootstrap(): Promise<void> {
  ensureRuntimeDirs()
  setupLogger()
  loadConfig()
  await openDatabase()
  bootstrapLibraryDomain()
  bootstrapSyncDomain()
  registerMediaProtocolHandler()
  registerIpcHandlers()

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  log.info('xImgs started', {
    version: app.getVersion(),
    userData: app.getPath('userData')
  })
}

app.whenReady().then(() => {
  void bootstrap().catch((error) => {
    log.error('Bootstrap failed', error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  shutdownSyncDomain()
  unregisterIpcHandlers()
  closeDatabase()
})
