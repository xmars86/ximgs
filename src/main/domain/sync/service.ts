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
  deleteSyncFileById,
  listSyncFiles,
  sumSyncedBytes
} from '@main/db/repos/syncFiles'
import { listSyncRuns } from '@main/db/repos/syncRuns'
import { isSyncRunInProgress } from './runner'
import { buildPublicUrl } from './objectKey'
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
import { createS3Client } from '@main/providers/s3'
import { clearSyncSecret, hasSyncSecret, loadSyncSecret, saveSyncSecret } from './secrets'
import {
  assertReadyToTestConnection,
  buildSetupChecklist
} from './validate'
import {
  bootstrapSchedulerFromSettings,
  cancelRunTracked,
  getSchedulerSnapshot,
  restartSchedulerIfRunning,
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

  restartSchedulerIfRunning()
  const next = getPublicConfig()
  if (next.autoStart && next.watchFolder && !getSchedulerSnapshot().isSchedulerRunning) {
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

export async function runNow() {
  return runNowTracked()
}

export async function retryFailed() {
  return retryFailedTracked()
}

export function listRuns(limit = 100) {
  return { items: listSyncRuns(limit) }
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

export function listFiles(query: SyncFileQuery = {}) {
  const result = listSyncFiles(query.limit ?? 500, query.offset ?? 0, {
    search: query.search,
    status: query.status,
    pathPrefix: query.pathPrefix,
    directOnly: query.directOnly
  })
  return withEncodedPublicUrls(result)
}

export function getDailyUploadStats(days = 7): SyncDailyUploadStats {
  const dayCount = Math.max(1, Math.min(Number(days) || 7, 31))
  const counts = countSyncedUploadsByLocalDay(dayCount)
  return summarizeDailyUploadStats(fillDailyUploadSeries(counts, dayCount))
}

export function getStatusCounts(): SyncFileStatusCounts {
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

export function browseFiles(query: SyncFileQuery = {}) {
  const result = browseSyncFiles(query.limit ?? 500, query.offset ?? 0, {
    search: query.search,
    status: query.status,
    pathPrefix: query.pathPrefix
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
    title: '选择要上传的图片',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
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

/** Removes the local gallery record only; does not delete the remote object. */
export function deleteFile(id: number): { deleted: boolean } {
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('INVALID_REQUEST', '无效的素材 ID')
  }
  return { deleted: deleteSyncFileById(id) }
}

/** Clears all local sync_files rows; does not delete remote objects. */
export async function clearFiles(): Promise<{ deleted: number; cancelled: boolean }> {
  if (isSyncRunInProgress()) {
    throw new AppError('SYNC_BUSY', '同步进行中，请先取消或等待结束后再清空记录')
  }

  const preview = listSyncFiles(1, 0)
  if (preview.total === 0) {
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
    message: `确认清空全部 ${preview.total} 条本地同步记录？`,
    detail:
      '素材库列表也会一并清空。云端已上传的文件不会被删除。清空后再次同步会重新上传覆盖同名对象。'
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
