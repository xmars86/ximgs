import { app } from 'electron'
import { dirname, join } from 'node:path'
import { accessSync, constants, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import type { AppPaths } from '@shared/ipc'

let libraryRoot: string | null = null

/**
 * Packaged builds: keep userData next to the exe (install / portable dir) so SQLite,
 * config, logs, and secrets travel with a green install. Must run before app ready.
 * Falls back to Electron default (%APPDATA%) when the install dir is not writable
 * (e.g. Program Files without elevation).
 */
export function configurePackagedUserData(): void {
  if (!app.isPackaged) {
    return
  }

  const besideExe = join(dirname(process.execPath), 'userData')
  if (!canUseAsUserDataDir(besideExe)) {
    return
  }

  app.setPath('userData', besideExe)
}

function canUseAsUserDataDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    const probe = join(dir, '.ximgs-write-probe')
    writeFileSync(probe, 'ok')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function ensureRuntimeDirs(): void {
  const root = app.getPath('userData')
  for (const dir of [join(root, 'logs'), join(root, 'secrets')]) {
    mkdirSync(dir, { recursive: true })
  }
}

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'ximgs.db')
}

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function getSecretsDir(): string {
  return join(app.getPath('userData'), 'secrets')
}

export function getLogsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

export function setLibraryRoot(path: string | null): void {
  libraryRoot = path
}

export function getLibraryRoot(): string | null {
  return libraryRoot
}

export function getAppPaths(): AppPaths {
  return {
    userData: app.getPath('userData'),
    logs: getLogsDir(),
    database: getDatabasePath(),
    config: getConfigPath(),
    secrets: getSecretsDir(),
    libraryRoot
  }
}
