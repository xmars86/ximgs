import { writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog } from 'electron'
import { AppError } from '@shared/errors'
import type { IpcMethod } from '@shared/ipc'
import { normalizeLocale } from '@shared/locale'
import {
  getDesktopPrefs,
  getLocale,
  setDesktopPrefs,
  setLocale
} from '@main/runtime/config'
import { getAppPaths } from '@main/runtime/paths'
import { refreshApplicationMenu } from '@main/menu'
import { refreshAppTrayMenu } from '@main/tray'

type Handler = (data: unknown) => unknown | Promise<unknown>

function asObject(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  if (typeof data !== 'object') {
    throw new AppError('INVALID_REQUEST', '请求参数无效')
  }
  return data as Record<string, unknown>
}

export function handleSystem(): Partial<Record<IpcMethod, Handler>> {
  return {
    'system.getAppInfo': () => ({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      isPackaged: app.isPackaged
    }),
    'system.getPaths': () => getAppPaths(),
    'system.ping': () => ({ pong: true as const, at: new Date().toISOString() }),
    'system.getLocale': () => ({ locale: getLocale() }),
    'system.setLocale': (data) => {
      const raw =
        data && typeof data === 'object' && 'locale' in data
          ? (data as { locale: unknown }).locale
          : undefined
      if (raw !== 'zh-CN' && raw !== 'en-US' && raw !== 'zh' && raw !== 'en') {
        throw new AppError('INVALID_LOCALE', 'locale must be zh-CN or en-US')
      }
      const locale = setLocale(normalizeLocale(raw))
      refreshAppTrayMenu()
      refreshApplicationMenu()
      return { locale }
    },
    'system.getDesktopPrefs': () => getDesktopPrefs(),
    'system.setDesktopPrefs': (data) => {
      const obj = asObject(data)
      const update: {
        closeToTray?: boolean
        openAtLogin?: boolean
        startHidden?: boolean
      } = {}
      if (typeof obj.closeToTray === 'boolean') update.closeToTray = obj.closeToTray
      if (typeof obj.openAtLogin === 'boolean') update.openAtLogin = obj.openAtLogin
      if (typeof obj.startHidden === 'boolean') update.startHidden = obj.startHidden
      const prefs = setDesktopPrefs(update)
      refreshAppTrayMenu()
      return prefs
    },
    'system.saveTextFile': async (data) => {
      const obj = asObject(data)
      const content = typeof obj.content === 'string' ? obj.content : ''
      if (!content) {
        throw new AppError('INVALID_REQUEST', '导出内容为空')
      }
      const defaultPath =
        typeof obj.defaultPath === 'string' && obj.defaultPath.trim()
          ? obj.defaultPath.trim()
          : 'export.txt'
      const filters = Array.isArray(obj.filters)
        ? obj.filters.filter(
            (f): f is { name: string; extensions: string[] } =>
              !!f &&
              typeof f === 'object' &&
              typeof (f as { name?: unknown }).name === 'string' &&
              Array.isArray((f as { extensions?: unknown }).extensions)
          )
        : [{ name: 'Text', extensions: ['txt'] }]

      const win = BrowserWindow.getFocusedWindow()
      const result = win
        ? await dialog.showSaveDialog(win, { defaultPath, filters })
        : await dialog.showSaveDialog({ defaultPath, filters })
      if (result.canceled || !result.filePath) {
        return { saved: false, path: null }
      }
      writeFileSync(result.filePath, content, 'utf8')
      return { saved: true, path: result.filePath }
    }
  }
}
