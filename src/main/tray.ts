import {
  Tray,
  Menu,
  BrowserWindow,
  app,
  dialog,
  Notification,
  type MenuItemConstructorOptions
} from 'electron'
import type { ShellEvent } from '@shared/desktop'
import { IPC_CHANNELS } from '@shared/ipc'
import { getTrayNativeImage } from './runtime/brand'
import {
  getDesktopPrefs,
  getLocale,
  markTrayHintSeen
} from './runtime/config'
import { log } from './runtime/logger'
import * as sync from './domain/sync/service'

let tray: Tray | null = null
let quitting = false
let getWindow: (() => BrowserWindow | null) | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
/** After first tray minimize, toast once when the window is shown again. */
let pendingRestoredHint = false

export function markAppQuitting(): void {
  quitting = true
}

function zh(): boolean {
  return getLocale() === 'zh-CN'
}

function sendShell(win: BrowserWindow | null | undefined, event: ShellEvent): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(IPC_CHANNELS.shell, event)
}

export function showMainWindow(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (pendingRestoredHint) {
    pendingRestoredHint = false
    sendShell(win, {
      type: 'toast',
      kind: 'info',
      message: zh()
        ? '已从托盘恢复。之后关闭窗口仍会回到托盘；要退出请右键托盘图标。'
        : 'Restored from tray. Closing the window hides to tray; quit from the tray menu.'
    })
  }
}

function buildTooltip(): string {
  const parts = ['xImgs']
  try {
    const syncSt = sync.getStatus()
    if (syncSt.isRunInProgress) parts.push(zh() ? '同步中…' : 'Syncing…')
    else if (syncSt.isSchedulerRunning) parts.push(zh() ? '定时同步开' : 'Scheduler on')
  } catch {
    // Domains may not be ready during early boot
  }
  return parts.join(' · ')
}

function notifyFirstTrayMinimize(win: BrowserWindow): void {
  if (getDesktopPrefs().trayHintSeen) return
  markTrayHintSeen()
  pendingRestoredHint = true

  sendShell(win, { type: 'tray-minimized', firstTime: true })

  const title = 'xImgs'
  const body = zh()
    ? '已最小化到系统托盘。右键托盘图标选择「退出」才会关闭软件。'
    : 'Minimized to the system tray. Right-click the tray icon and choose Quit to exit.'

  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  } catch (error) {
    log.warn('Tray Notification failed', error)
  }
}

function hideToTray(win: BrowserWindow): void {
  const first = !getDesktopPrefs().trayHintSeen
  if (first) {
    notifyFirstTrayMinimize(win)
    setTimeout(() => {
      if (!win.isDestroyed() && !quitting) win.hide()
      refreshTrayChrome()
    }, 350)
    return
  }
  win.hide()
  refreshTrayChrome()
}

async function confirmQuitIfNeeded(): Promise<boolean> {
  const reasons: string[] = []
  try {
    const syncSt = sync.getStatus()
    if (syncSt.isRunInProgress) {
      reasons.push(zh() ? '正在执行同步任务' : 'A sync run is in progress')
    }
  } catch {
    // ignore
  }

  if (reasons.length === 0) return true

  const win = getWindow?.() ?? null
  const options = {
    type: 'warning' as const,
    buttons: zh() ? ['退出', '取消'] : ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'xImgs',
    message: zh() ? '确定要退出 xImgs 吗？' : 'Quit xImgs?',
    detail: reasons.join('\n')
  }
  const result =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
  return result.response === 0
}

async function requestQuit(): Promise<void> {
  const ok = await confirmQuitIfNeeded()
  if (!ok) return
  quitting = true
  app.quit()
}

async function trayRunSyncNow(): Promise<void> {
  const win = getWindow?.() ?? null
  try {
    sendShell(win, {
      type: 'toast',
      kind: 'info',
      message: zh() ? '已开始立即同步' : 'Sync started'
    })
    refreshTrayChrome()
    await sync.runNow()
    refreshTrayChrome()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'xImgs',
      message: zh() ? '无法开始同步' : 'Could not start sync',
      detail: message
    })
    refreshTrayChrome()
  }
}

function buildTrayMenu(): Menu {
  const items: MenuItemConstructorOptions[] = [
    {
      label: zh() ? '显示主窗口' : 'Show window',
      click: () => showMainWindow(getWindow?.() ?? null)
    },
    { type: 'separator' }
  ]

  try {
    const syncSt = sync.getStatus()
    items.push({
      label: syncSt.isRunInProgress
        ? zh()
          ? '同步进行中…'
          : 'Syncing…'
        : zh()
          ? '立即同步'
          : 'Sync now',
      enabled: !syncSt.isRunInProgress,
      click: () => {
        void trayRunSyncNow()
      }
    })
  } catch {
    // Domains not ready
  }

  items.push(
    { type: 'separator' },
    {
      label: zh() ? '退出' : 'Quit',
      click: () => {
        void requestQuit()
      }
    }
  )

  return Menu.buildFromTemplate(items)
}

export function refreshTrayChrome(): void {
  if (!tray) return
  try {
    tray.setToolTip(buildTooltip())
    tray.setContextMenu(buildTrayMenu())
  } catch (error) {
    log.warn('refreshTrayChrome failed', error)
  }
}

/** Close / X → tray when enabled; otherwise allow real close. */
export function attachCloseToTray(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitting) return
    if (!getDesktopPrefs().closeToTray) return
    event.preventDefault()
    hideToTray(win)
  })
}

export function createAppTray(resolveWindow: () => BrowserWindow | null): Tray | null {
  const image = getTrayNativeImage()
  if (!image) {
    log.warn('Tray icon missing; system tray not created')
    return null
  }

  destroyAppTray()
  getWindow = resolveWindow

  tray = new Tray(image)
  tray.setToolTip(buildTooltip())
  tray.setContextMenu(buildTrayMenu())

  tray.on('click', () => showMainWindow(getWindow?.() ?? null))
  tray.on('double-click', () => showMainWindow(getWindow?.() ?? null))
  tray.on('right-click', () => {
    refreshTrayChrome()
  })

  refreshTimer = setInterval(() => refreshTrayChrome(), 4000)
  log.info('System tray ready')
  return tray
}

export function refreshAppTrayMenu(): void {
  refreshTrayChrome()
}

export function destroyAppTray(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (!tray) return
  tray.destroy()
  tray = null
}
