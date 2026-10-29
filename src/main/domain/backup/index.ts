import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app, dialog, BrowserWindow } from 'electron'
import { AppError } from '@shared/errors'
import { flushPersist, isDbOpen } from '@main/db/client'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import { getConfigPath, getDatabasePath, getSecretsDir } from '@main/runtime/paths'
import { log } from '@main/runtime/logger'

export const backupDomainReady = true

const RESTORE_DIR_NAME = 'restore-pending'

export function getRestorePendingDir(): string {
  return join(app.getPath('userData'), RESTORE_DIR_NAME)
}

function stampFolderName(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `ximgs-backup-${y}${m}${day}-${h}${min}`
}

function writeMigrateTxt(dir: string, watchFolder: string | null): void {
  const lines = [
    'xImgs backup / migration package',
    '================================',
    '',
    'Contents:',
    '- ximgs.db          SQLite metadata (sync files, SKUs, settings, runs)',
    '- secrets/          Encrypted credentials (safeStorage / fallback)',
    '- config.json       App prefs (locale, desktop) when present',
    '',
    'NOT included (copy yourself):',
    `- Original images under watch folder: ${watchFolder || '(not configured)'}`,
    '',
    'Restore:',
    '1. Install the same major xImgs version on the new machine.',
    '2. Settings → Data → Import backup → select this folder.',
    '3. Restart the app when prompted.',
    '4. Point watch folder to the copied originals (or NAS path).',
    '',
    '中文说明：',
    '- 本包含数据库与加密密钥，不含监控目录原图。',
    '- 换机请自行拷贝监控目录 / NAS 路径下的图片。',
    '- 在设置「数据」中导入本目录后按提示重启。',
    `- 当前记录的监控目录：${watchFolder || '（未配置）'}`,
    ''
  ]
  writeFileSync(join(dir, 'MIGRATE.txt'), lines.join('\n'), 'utf8')
}

export async function exportBackupPackage(): Promise<{
  exported: boolean
  path: string | null
}> {
  const win = BrowserWindow.getFocusedWindow()
  const pick = win
    ? await dialog.showOpenDialog(win, {
        title: '选择备份导出目录',
        properties: ['openDirectory', 'createDirectory']
      })
    : await dialog.showOpenDialog({
        title: '选择备份导出目录',
        properties: ['openDirectory', 'createDirectory']
      })
  if (pick.canceled || !pick.filePaths[0]) {
    return { exported: false, path: null }
  }

  if (isDbOpen()) {
    try {
      flushPersist()
    } catch (error) {
      log.warn('flushPersist before backup failed', error)
    }
  }

  const outRoot = join(pick.filePaths[0], stampFolderName())
  mkdirSync(outRoot, { recursive: true })

  const dbPath = getDatabasePath()
  if (!existsSync(dbPath)) {
    throw new AppError('BACKUP_DB_MISSING', '数据库文件不存在，无法导出')
  }
  copyFileSync(dbPath, join(outRoot, 'ximgs.db'))

  const secretsDir = getSecretsDir()
  if (existsSync(secretsDir)) {
    cpSync(secretsDir, join(outRoot, 'secrets'), { recursive: true })
  } else {
    mkdirSync(join(outRoot, 'secrets'), { recursive: true })
  }

  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    copyFileSync(configPath, join(outRoot, 'config.json'))
  }

  const watchFolder = getSyncSettings().watchFolder
  writeMigrateTxt(outRoot, watchFolder)

  log.info('Backup package exported', { path: outRoot })
  return { exported: true, path: outRoot }
}

function looksLikeBackupDir(dir: string): boolean {
  return existsSync(join(dir, 'ximgs.db'))
}

export async function importBackupPackage(): Promise<{
  imported: boolean
  path: string | null
  restartRequired: boolean
}> {
  const win = BrowserWindow.getFocusedWindow()
  const pick = win
    ? await dialog.showOpenDialog(win, {
        title: '选择备份包目录（含 ximgs.db）',
        properties: ['openDirectory']
      })
    : await dialog.showOpenDialog({
        title: '选择备份包目录（含 ximgs.db）',
        properties: ['openDirectory']
      })
  if (pick.canceled || !pick.filePaths[0]) {
    return { imported: false, path: null, restartRequired: false }
  }

  const src = pick.filePaths[0]
  if (!looksLikeBackupDir(src)) {
    throw new AppError('BACKUP_INVALID', '所选目录不是有效备份包（缺少 ximgs.db）')
  }

  const pending = getRestorePendingDir()
  if (existsSync(pending)) {
    rmSync(pending, { recursive: true, force: true })
  }
  mkdirSync(pending, { recursive: true })

  copyFileSync(join(src, 'ximgs.db'), join(pending, 'ximgs.db'))
  const secretsSrc = join(src, 'secrets')
  if (existsSync(secretsSrc)) {
    cpSync(secretsSrc, join(pending, 'secrets'), { recursive: true })
  }
  const configSrc = join(src, 'config.json')
  if (existsSync(configSrc)) {
    copyFileSync(configSrc, join(pending, 'config.json'))
  }
  writeFileSync(
    join(pending, 'PENDING.json'),
    JSON.stringify({ source: src, at: new Date().toISOString() }),
    'utf8'
  )

  log.info('Backup staged for restore on next launch', { source: src, pending })
  return { imported: true, path: src, restartRequired: true }
}

/**
 * Apply staged restore before opening SQLite. Safe to call every boot.
 * Returns true when a restore was applied.
 */
export function applyPendingRestoreIfAny(): boolean {
  const pending = getRestorePendingDir()
  if (!existsSync(pending) || !existsSync(join(pending, 'ximgs.db'))) {
    return false
  }

  const userData = app.getPath('userData')
  const dbDest = getDatabasePath()
  const secretsDest = getSecretsDir()
  const configDest = getConfigPath()

  try {
    mkdirSync(dirname(dbDest), { recursive: true })
    if (existsSync(dbDest)) {
      const bak = `${dbDest}.pre-restore-${Date.now()}.bak`
      copyFileSync(dbDest, bak)
    }
    copyFileSync(join(pending, 'ximgs.db'), dbDest)

    const pendingSecrets = join(pending, 'secrets')
    if (existsSync(pendingSecrets)) {
      if (existsSync(secretsDest)) {
        rmSync(secretsDest, { recursive: true, force: true })
      }
      cpSync(pendingSecrets, secretsDest, { recursive: true })
    }

    const pendingConfig = join(pending, 'config.json')
    if (existsSync(pendingConfig)) {
      copyFileSync(pendingConfig, configDest)
    }

    rmSync(pending, { recursive: true, force: true })
    log.info('Applied pending backup restore', { dbDest })
    return true
  } catch (error) {
    log.error('Failed to apply pending restore', error)
    return false
  }
}

/** Test helper: unique destination file name under a directory. */
export function uniqueFileName(dir: string, fileName: string): string {
  const safe = basename(fileName).replace(/[<>:"|?*\u0000-\u001f]/g, '_') || 'file'
  const extIdx = safe.lastIndexOf('.')
  const stem = extIdx > 0 ? safe.slice(0, extIdx) : safe
  const ext = extIdx > 0 ? safe.slice(extIdx) : ''
  let candidate = safe
  let n = 1
  while (existsSync(join(dir, candidate))) {
    candidate = `${stem}_${n}${ext}`
    n += 1
  }
  return candidate
}

export function getBackupGuide(): { text: string } {
  return {
    text:
      '导出：选择空目录，生成含 ximgs.db、secrets、MIGRATE.txt 的备份包。\n' +
      '导入：选择该备份包目录，重启后恢复元数据与密钥。\n' +
      '原图不在备份包内，请自行拷贝监控目录 / NAS。'
  }
}
