import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { app } from 'electron'
import { type AppLocale, normalizeLocale } from '@shared/locale'
import {
  DEFAULT_DESKTOP_PREFS,
  type DesktopPrefs,
  type DesktopPrefsUpdate
} from '@shared/desktop'
import { getConfigPath, setLibraryRoot } from './paths'
import { log } from './logger'

export interface AppConfig {
  libraryRoot: string | null
  locale: AppLocale
  closeToTray?: boolean
  openAtLogin?: boolean
  startHidden?: boolean
  trayHintSeen?: boolean
}

const DEFAULT_CONFIG: AppConfig = {
  libraryRoot: null,
  locale: 'zh-CN',
  ...DEFAULT_DESKTOP_PREFS
}


function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function loadConfig(): AppConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    saveConfig(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppConfig>
    const config: AppConfig = {
      libraryRoot: raw.libraryRoot ?? null,
      locale: normalizeLocale(raw.locale),
      closeToTray: asBool(raw.closeToTray, DEFAULT_DESKTOP_PREFS.closeToTray),
      openAtLogin: asBool(raw.openAtLogin, DEFAULT_DESKTOP_PREFS.openAtLogin),
      startHidden: asBool(raw.startHidden, DEFAULT_DESKTOP_PREFS.startHidden),
      trayHintSeen: asBool(raw.trayHintSeen, DEFAULT_DESKTOP_PREFS.trayHintSeen)
    }
    setLibraryRoot(config.libraryRoot)
    return config
  } catch (error) {
    log.warn('Failed to read config, using defaults', error)
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8')
  setLibraryRoot(config.libraryRoot)
}

export function getLocale(): AppLocale {
  return loadConfig().locale
}

export function setLocale(locale: AppLocale): AppLocale {
  const config = loadConfig()
  config.locale = normalizeLocale(locale)
  saveConfig(config)
  return config.locale
}

export function getDesktopPrefs(): DesktopPrefs {
  const c = loadConfig()
  return {
    closeToTray: c.closeToTray ?? DEFAULT_DESKTOP_PREFS.closeToTray,
    openAtLogin: c.openAtLogin ?? DEFAULT_DESKTOP_PREFS.openAtLogin,
    startHidden: c.startHidden ?? DEFAULT_DESKTOP_PREFS.startHidden,
    trayHintSeen: c.trayHintSeen ?? DEFAULT_DESKTOP_PREFS.trayHintSeen
  }
}

/** Sync Electron login-item settings with persisted prefs (Windows args / macOS openAsHidden). */
export function applyLoginItemSettings(prefs: DesktopPrefs): void {
  if (!app.isReady()) return
  try {
    app.setLoginItemSettings({
      openAtLogin: prefs.openAtLogin,
      openAsHidden: prefs.startHidden,
      args: prefs.startHidden ? ['--hidden'] : []
    })
  } catch (error) {
    log.warn('setLoginItemSettings failed', error)
  }
}

export function setDesktopPrefs(update: DesktopPrefsUpdate): DesktopPrefs {
  const config = loadConfig()
  if (typeof update.closeToTray === 'boolean') config.closeToTray = update.closeToTray
  if (typeof update.openAtLogin === 'boolean') config.openAtLogin = update.openAtLogin
  if (typeof update.startHidden === 'boolean') config.startHidden = update.startHidden
  saveConfig(config)
  const prefs = getDesktopPrefs()
  applyLoginItemSettings(prefs)
  return prefs
}

export function markTrayHintSeen(): void {
  const config = loadConfig()
  if (config.trayHintSeen) return
  config.trayHintSeen = true
  saveConfig(config)
}

export function shouldStartHidden(): boolean {
  if (process.argv.includes('--hidden') || process.argv.includes('--start-hidden')) return true
  return getDesktopPrefs().startHidden
}
