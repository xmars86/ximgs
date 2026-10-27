import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { type AppLocale, normalizeLocale } from '@shared/locale'
import { getConfigPath, setLibraryRoot } from './paths'
import { log } from './logger'

export interface AppConfig {
  libraryRoot: string | null
  locale: AppLocale
}

const DEFAULT_CONFIG: AppConfig = {
  libraryRoot: null,
  locale: 'zh-CN'
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
      locale: normalizeLocale(raw.locale)
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
