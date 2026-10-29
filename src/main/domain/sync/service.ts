import { existsSync, unlinkSync } from 'node:fs'
import { dialog, BrowserWindow } from 'electron'
import { AppError } from '@shared/errors'
import type {
  SingleUploadResult,
  SyncConfigPublic,
  SyncConfigUpdate,
  SyncDailyUploadStats,
  SyncFileQuery,
  SyncFileStatusCounts,
  SyncSetupChecklist
} from '@shared/sync'
import { fillDailyUploadSeries, summarizeDailyUploadStats } from '@shared/syncDaily'
import { getSyncSettings, updateSyncSettings } from '@main/db/repos/syncSettings'
import {
  browseSyncFiles,
  clearAllSyncFiles,
  countByStatus,
  countSyncedUploadsByLocalDay,
  countTrashedSyncFiles,
  getSyncFileById,
  listSyncFiles,
  purgeSyncFileById,
  restoreSyncFileById,
  sumSyncedBytes,
  trashSyncFileById
} from '@main/db/repos/syncFiles'
import { clearAllSyncRuns, countSyncRuns, listSyncRuns } from '@main/db/repos/syncRuns'
import { isSyncRunInProgress } from './runner'
import { buildObjectKey, buildPublicUrl } from './objectKey'
import { resolveLocalMediaPath } from './localPath'
import { createUploadContext } from './uploadContext'
import { log } from '@main/runtime/logger'
import {
  uploadClipboardImage,
  uploadMultipleImages,
  uploadSingleImage
} from './singleUpload'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import {
  deriveB2Endpoint,
  resolveB2Config,
  testB2Connection
} from '@main/providers/backblaze'
import { deriveR2Endpoint } from '@shared/r2'
import { resolveR2Config, testR2Connection } from '@main/providers/r2'
import { resolveRegionalConfig, testRegionalConnection } from '@main/providers/regional'
import {
  deriveRegionalEndpoint,
  deriveRegionalPublicBase,
  isRegionalProvider
} from '@shared/regional'
import { createS3Client, deleteObjectFileVerified } from '@main/providers/s3'
import { clearSyncSecret, hasSyncSecret, loadSyncSecret, saveSyncSecret } from './secrets'
import {
  assertReadyToTestConnection,
  buildSetupChecklist
} from './validate'
import {
  bootstrapSchedulerFromSettings,
  cancelRunTracked,
  clearLastRunSnapshot,
  getSchedulerSnapshot,
  isSchedulerRunning,
  pauseRunTracked,
  retryFailedTracked,
  runNowTracked,
  startScheduler,
  stopScheduler
} from './scheduler'

export function getPublicConfig(): SyncConfigPublic {
  const s = getSyncSettings()
  return {
    watchFolder: s.watchFolder,
    intervalMinutes: s.intervalMinutes,
    autoStart: s.autoStart,
    objectPrefix: s.objectPrefix,
    provider: s.provider,
    endpoint: s.endpoint,
    region: s.region,
    bucket: s.bucket,
    publicBaseUrl: s.publicBaseUrl,
    accessKeyId: s.accessKeyId,
    sseMode: s.sseMode,
    hasSecretAccessKey: hasSyncSecret()
  }
}

export function getChecklist(): SyncSetupChecklist {
  return buildSetupChecklist(getSyncSettings())
}

export function setConfig(update: SyncConfigUpdate): SyncConfigPublic {
  if (update.secretAccessKey !== undefined) {
    const secret = update.secretAccessKey.trim()
    if (secret) {
      saveSyncSecret(secret)
    }
  }

  let endpoint = update.endpoint
  let region = update.region
  let publicBaseUrl = update.publicBaseUrl
  const provider = update.provider ?? getSyncSettings().provider
  const touchesStorage =
    update.provider !== undefined ||
    update.endpoint !== undefined ||
    update.region !== undefined ||
    update.bucket !== undefined ||
    update.publicBaseUrl !== undefined

  if (provider === 'b2') {
    const nextRegion = (region ?? getSyncSettings().region).trim()
    const nextEndpoint = (endpoint ?? getSyncSettings().endpoint).trim()
    if (nextRegion && !nextEndpoint) {
      endpoint = deriveB2Endpoint(nextRegion)
    } else if (endpoint !== undefined && !endpoint.trim() && nextRegion) {
      endpoint = deriveB2Endpoint(nextRegion)
    }
  }

  if (provider === 'r2') {
    const nextEndpoint = (endpoint ?? getSyncSettings().endpoint).trim()
    endpoint = deriveR2Endpoint('', nextEndpoint)
    const nextRegion = (region ?? getSyncSettings().region).trim()
    region = nextRegion || 'auto'
  }

  if (touchesStorage && isRegionalProvider(provider)) {
    const current = getSyncSettings()
    const nextRegion = (region ?? current.region).trim()
    const nextEndpoint = (endpoint ?? current.endpoint).trim()
    const nextBucket = (update.bucket ?? current.bucket).trim()
    const nextPublic = (publicBaseUrl ?? current.publicBaseUrl).trim()
    region = nextRegion
    endpoint = deriveRegionalEndpoint(provider, nextRegion, nextEndpoint)
    publicBaseUrl = deriveRegionalPublicBase(provider, nextBucket, nextRegion, nextPublic)
  }

  const prevInterval = getSyncSettings().intervalMinutes
  updateSyncSettings({
    watchFolder: update.watchFolder,
    intervalMinutes: update.intervalMinutes,
    autoStart: update.autoStart,
    objectPrefix: update.objectPrefix,
    provider: update.provider,
    endpoint,
    region,
    bucket: update.bucket,
    publicBaseUrl,
    accessKeyId: update.accessKeyId,
    sseMode: update.sseMode
  })

  // Keep scheduler aligned with autoStart + watchFolder; re-arm only when interval changes.
  const next = getPublicConfig()
  const shouldRun = Boolean(next.autoStart && next.watchFolder)
  if (!shouldRun) {
    stopScheduler()
  } else if (!isSchedulerRunning()) {
    startScheduler()
  } else if (next.intervalMinutes !== prevInterval) {
    startScheduler()
  }
  return next
}

export async function chooseWatchFolder(): Promise<{ watchFolder: string | null }> {
  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: '选择同步监控目录',
    properties: ['openDirectory']
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) {
    return { watchFolder: null }
  }
  updateSyncSettings({ watchFolder: result.filePaths[0] })
  return { watchFolder: result.filePaths[0] }
}

export function getStatus() {
  const snap = getSchedulerSnapshot()
  const counts = countByStatus()
  return {
    ...snap,
    failedCount: counts.error ?? 0
  }
}

export function start() {
  const s = getSyncSettings()
  if (!s.watchFolder) {
    throw new AppError('WATCH_FOLDER_MISSING', '请先选择监控目录')
  }
  const checklist = buildSetupChecklist(s)
  if (!checklist.hasProviderConfig) {
    throw new AppError(
      'SYNC_CONFIG_INCOMPLETE',
      `配置未完成，无法开启定时：\n- ${checklist.missing.filter((m) => !m.includes('监控目录')).join('\n- ')}`
    )
  }
  updateSyncSettings({ autoStart: true })
  startScheduler()
  return getStatus()
}

export function stop() {
  updateSyncSettings({ autoStart: false })
  stopScheduler()
  return getStatus()
}

/** Cancel the current sync/retry batch; does not stop the scheduler by itself. */
export function cancel() {
  return cancelRunTracked()
}

/** Pause the current sync/retry batch between files; resume with runNow. */
export function pause() {
  return pauseRunTracked()
}

export async function runNow() {
  return runNowTracked()
}

export async function retryFailed() {
  return retryFailedTracked()
}

export function listRuns(limit = 100) {
  return { items: listSyncRuns(limit) }
}

/** Clears all local sync_runs history; does not touch sync_files or remote objects. */
export async function clearRuns(): Promise<{ deleted: number; cancelled: boolean }> {
  if (isSyncRunInProgress()) {
    throw new AppError('SYNC_BUSY', '同步进行中，请先取消或等待结束后再清空日志')
  }

  const previewTotal = countSyncRuns()
  if (previewTotal === 0) {
    return { deleted: 0, cancelled: false }
  }

  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['清空日志', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: '清空同步日志',
    message: `确认清空全部 ${previewTotal} 条同步运行记录？`,
    detail: '仅删除本地 sync_runs 历史。失败文件状态与云端对象不会受影响。'
  }
  const box = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  if (box.response !== 0) {
    return { deleted: 0, cancelled: true }
  }

  const result = clearAllSyncRuns()
  clearLastRunSnapshot()
  log.info('Cleared sync runs', { deleted: result.deleted })
  return { deleted: result.deleted, cancelled: false }
}

function withEncodedPublicUrls<T extends { items: { objectKey: string | null; publicUrl: string | null }[] }>(
  result: T
): T {
  const base = getSyncSettings().publicBaseUrl.trim()
  if (!base) return result
  return {
    ...result,
    items: result.items.map((item) => {
      if (!item.objectKey) return item
      return { ...item, publicUrl: buildPublicUrl(base, item.objectKey) }
    })
  }
}

export async function listFiles(query: SyncFileQuery = {}) {
  const result = listSyncFiles(query.limit ?? 500, query.offset ?? 0, {
    search: query.search,
    status: query.status,
    pathPrefix: query.pathPrefix,
    directOnly: query.directOnly,
    trashOnly: query.trashOnly
  })
  return withEncodedPublicUrls(result)
}

export function getDailyUploadStats(days = 7): SyncDailyUploadStats {
  const dayCount = Math.max(1, Math.min(Number(days) || 7, 31))
  const counts = countSyncedUploadsByLocalDay(dayCount)
  return summarizeDailyUploadStats(fillDailyUploadSeries(counts, dayCount))
}

export async function getStatusCounts(): Promise<SyncFileStatusCounts> {
  const counts = countByStatus()
  const synced = counts.synced ?? 0
  const pending = counts.pending ?? 0
  const error = counts.error ?? 0
  const skipped = counts.skipped ?? 0
  return {
    all: synced + pending + error + skipped,
    synced,
    pending,
    error,
    skipped,
    totalBytes: sumSyncedBytes()
  }
}

export async function browseFiles(query: SyncFileQuery = {}) {
  const result = browseSyncFiles(query.limit ?? 500, query.offset ?? 0, {
    search: query.search,
    status: query.status,
    pathPrefix: query.pathPrefix,
    trashOnly: query.trashOnly
  })
  return withEncodedPublicUrls(result)
}

export async function uploadSingle(
  filePath: string,
  folderPath?: string
): Promise<SingleUploadResult> {
  return uploadSingleImage(filePath, { folderPath })
}

export async function uploadPaths(
  paths: string[],
  folderPath?: string
): Promise<Awaited<ReturnType<typeof uploadMultipleImages>>> {
  if (!paths?.length) {
    throw new AppError('INVALID_REQUEST', '未选择文件')
  }
  return uploadMultipleImages(paths, { folderPath })
}

export async function uploadClipboard(folderPath?: string): Promise<SingleUploadResult> {
  return uploadClipboardImage({ folderPath })
}

export async function chooseImagePaths(): Promise<string[]> {
  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: '选择要上传的图片或视频',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images & Videos',
        extensions: [
          'jpg',
          'jpeg',
          'png',
          'gif',
          'bmp',
          'webp',
          'mp4',
          'mov',
          'm4v',
          'webm',
          'avi'
        ]
      },
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
      },
      {
        name: 'Videos',
        extensions: ['mp4', 'mov', 'm4v', 'webm', 'avi']
      }
    ]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths.length) {
    return []
  }
  return result.filePaths
}

export async function chooseAndUploadSingle(
  folderPath?: string
): Promise<Awaited<ReturnType<typeof uploadMultipleImages>> | null> {
  const paths = await chooseImagePaths()
  if (!paths.length) return null
  return uploadMultipleImages(paths, { folderPath })
}

/** Move gallery record into recycle bin; does not delete disk/remote objects. */
export function deleteFile(id: number): { deleted: boolean } {
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('INVALID_REQUEST', '无效的素材 ID')
  }
  return { deleted: trashSyncFileById(id) }
}

export function restoreFile(id: number): { restored: boolean } {
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('INVALID_REQUEST', '无效的素材 ID')
  }
  return { restored: restoreSyncFileById(id) }
}

function normalizeObjectKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

/** Collect candidate object keys (stored / rebuilt / derived from public URL). */
function collectRemoteObjectKeys(
  row: { objectKey: string | null; relativePath: string; publicUrl: string | null; status: string },
  objectPrefix: string,
  publicBaseUrl: string
): string[] {
  const keys: string[] = []
  const push = (value: string | null | undefined): void => {
    if (!value) return
    const key = normalizeObjectKey(value)
    if (key && !keys.includes(key)) keys.push(key)
  }

  push(row.objectKey)
  if (row.status === 'synced' || row.publicUrl || row.objectKey) {
    push(buildObjectKey(objectPrefix, row.relativePath))
  }
  const base = publicBaseUrl.trim().replace(/\/+$/, '')
  const url = row.publicUrl?.trim() ?? ''
  if (base && url.startsWith(`${base}/`)) {
    const raw = url.slice(base.length + 1)
    try {
      push(decodeURIComponent(raw))
    } catch {
      push(raw)
    }
  }
  return keys
}

/** Best-effort: CDN may still HIT after origin versions are gone. */
async function warnIfPublicUrlStillCached(publicUrl: string, id: number): Promise<void> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    const res = await fetch(publicUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    })
    clearTimeout(timer)
    if (res.ok) {
      log.warn(
        'Origin object purged but public URL still returns OK (likely CDN cache; purge CDN or wait for TTL)',
        {
          id,
          publicUrl,
          status: res.status,
          cfCache: res.headers.get('cf-cache-status'),
          age: res.headers.get('age')
        }
      )
    }
  } catch (error) {
    log.debug('Public URL cache probe skipped', {
      id,
      publicUrl,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Permanent delete from recycle bin:
 * 1) delete remote object (all versions when supported) — abort on failure
 * 2) delete local file under watch folder — abort on failure
 * 3) delete DB row (SKU bindings cascade)
 */
export async function purgeFile(id: number): Promise<{ purged: boolean }> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('INVALID_REQUEST', '无效的素材 ID')
  }

  const row = getSyncFileById(id)
  if (!row || !row.isTrashed) {
    return { purged: false }
  }

  const settings = getSyncSettings()
  const candidateKeys = collectRemoteObjectKeys(row, settings.objectPrefix, settings.publicBaseUrl)
  const needsRemote = candidateKeys.length > 0 || Boolean(row.publicUrl) || row.status === 'synced'

  if (needsRemote) {
    if (candidateKeys.length === 0) {
      throw new AppError(
        'REMOTE_KEY_MISSING',
        '无法确定云端对象键，已中止彻底删除（请检查同步配置后重试）'
      )
    }
    const secret = loadSyncSecret()
    if (!secret) {
      throw new AppError('S3_SECRET_MISSING', '缺少密钥，无法删除云端对象；已中止彻底删除')
    }
    const ctx = createUploadContext(secret)
    try {
      let confirmedGone = false
      let lastError: unknown = null
      let deletedKey: string | null = null
      for (const objectKey of candidateKeys) {
        try {
          log.info('Purging remote object', { id, bucket: ctx.bucket, objectKey })
          const result = await deleteObjectFileVerified(ctx.client, ctx.bucket, objectKey)
          log.info('Purged remote object', { id, objectKey, result })
          confirmedGone = true
          if (result === 'deleted') {
            deletedKey = objectKey
            break
          }
        } catch (error) {
          lastError = error
          log.warn('Remote purge candidate failed', {
            id,
            objectKey,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      if (!confirmedGone) {
        const message =
          lastError instanceof Error ? lastError.message : String(lastError ?? '未知错误')
        throw new AppError(
          'REMOTE_DELETE_FAILED',
          `云端删除失败，未删除本地文件：${message}`,
          { cause: lastError }
        )
      }
      // Custom CDN (e.g. Cloudflare in front of B2) may keep serving a HIT after origin purge.
      const publicUrl = row.publicUrl?.trim()
      if (publicUrl && deletedKey) {
        void warnIfPublicUrlStillCached(publicUrl, id)
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new AppError(
        'REMOTE_DELETE_FAILED',
        `云端删除失败，未删除本地文件：${message}`,
        { cause: error }
      )
    } finally {
      ctx.client.destroy()
    }
  }

  const watchFolder = settings.watchFolder?.trim()
  if (!watchFolder) {
    throw new AppError('WATCH_FOLDER_MISSING', '未配置同步目录，无法删除本地文件；已中止彻底删除')
  }
  const localPath = resolveLocalMediaPath(watchFolder, row.relativePath)
  if (!localPath) {
    throw new AppError(
      'LOCAL_PATH_INVALID',
      `无法解析本地路径（${row.relativePath}），已中止彻底删除`
    )
  }
  if (existsSync(localPath)) {
    try {
      unlinkSync(localPath)
      if (existsSync(localPath)) {
        throw new Error('unlink 后文件仍存在（可能无删除权限）')
      }
      log.info('Purged local file', { id, localPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new AppError(
        'LOCAL_DELETE_FAILED',
        `云端已处理，但本地文件删除失败：${message}`,
        { cause: error }
      )
    }
  } else {
    log.info('Local file already missing; continue purge', { id, localPath })
  }

  return { purged: purgeSyncFileById(id) }
}

export function getTrashCount(): { count: number } {
  return { count: countTrashedSyncFiles() }
}

/** Clears all local sync_files rows; does not delete remote objects. */
export async function clearFiles(): Promise<{ deleted: number; cancelled: boolean }> {
  if (isSyncRunInProgress()) {
    throw new AppError('SYNC_BUSY', '同步进行中，请先取消或等待结束后再清空记录')
  }

  const activeTotal = listSyncFiles(1, 0).total
  const trashTotal = countTrashedSyncFiles()
  const previewTotal = activeTotal + trashTotal
  if (previewTotal === 0) {
    return { deleted: 0, cancelled: false }
  }

  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['清空记录', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: '清空同步记录',
    message: `确认清空全部 ${previewTotal} 条本地同步记录？`,
    detail:
      '素材库与回收站都会清空。云端已上传的文件不会被删除。清空后再次同步会重新上传覆盖同名对象。'
  }
  const box = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  if (box.response !== 0) {
    return { deleted: 0, cancelled: true }
  }

  const result = clearAllSyncFiles()
  return { deleted: result.deleted, cancelled: false }
}

export async function testConnection(): Promise<{ ok: true; provider: string }> {
  const s = getSyncSettings()
  assertReadyToTestConnection(s)
  const secret = loadSyncSecret()
  if (!secret) {
    throw new AppError('S3_SECRET_MISSING', '缺少 Application Key / Secret（请填写并保存）')
  }

  if (isRegionalProvider(s.provider)) {
    const regional = resolveRegionalConfig(s.provider, {
      accessKeyId: s.accessKeyId,
      secretAccessKey: secret,
      bucketName: s.bucket,
      region: s.region,
      endpoint: s.endpoint,
      publicBaseUrl: s.publicBaseUrl,
      keyPrefix: s.objectPrefix
    })
    await testRegionalConnection(regional)
    return { ok: true as const, provider: s.provider }
  }

  if (s.provider === 'r2') {
    const r2 = resolveR2Config({
      accessKeyId: s.accessKeyId,
      secretAccessKey: secret,
      bucketName: s.bucket,
      region: s.region,
      endpoint: s.endpoint,
      publicBaseUrl: s.publicBaseUrl,
      keyPrefix: s.objectPrefix
    })
    await testR2Connection(r2)
    return { ok: true as const, provider: 'r2' }
  }

  if (s.provider === 's3') {
    const client = createS3Client({
      endpoint: s.endpoint,
      region: s.region || 'auto',
      bucket: s.bucket,
      accessKeyId: s.accessKeyId,
      secretAccessKey: secret,
      forcePathStyle: Boolean(s.endpoint.trim())
    })
    try {
      await client.send(new HeadBucketCommand({ Bucket: s.bucket }))
      return { ok: true as const, provider: 's3' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new AppError('S3_CONNECTION_FAILED', `S3 连接失败：${message}`, { cause: error })
    } finally {
      client.destroy()
    }
  }

  const b2 = resolveB2Config({
    keyId: s.accessKeyId,
    applicationKey: secret,
    bucketName: s.bucket,
    region: s.region,
    endpoint: s.endpoint,
    publicBaseUrl: s.publicBaseUrl,
    keyPrefix: s.objectPrefix,
    sseMode: s.sseMode
  })
  await testB2Connection(b2)
  return { ok: true as const, provider: 'b2' }
}

export function bootstrapSyncDomain(): void {
  bootstrapSchedulerFromSettings()
}

export function shutdownSyncDomain(): void {
  stopScheduler()
}

export function wipeSecretForTests(): void {
  clearSyncSecret()
}
