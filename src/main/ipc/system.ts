import { app } from 'electron'
import { AppError } from '@shared/errors'
import type { IpcMethod } from '@shared/ipc'
import { normalizeLocale } from '@shared/locale'
import { getLocale, setLocale } from '@main/runtime/config'
import { getAppPaths } from '@main/runtime/paths'

type Handler = (data: unknown) => unknown

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
      return { locale: setLocale(normalizeLocale(raw)) }
    }
  }
}
