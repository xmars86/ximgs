import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import type { SyncRunResult } from '@shared/sync'
import { emitTaskProgress } from '@main/ipc/progress'
import { log } from '@main/runtime/logger'
import { md5File } from '@main/domain/library/hash'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import {
  findSyncFileByPath,
  listFailedRelativePaths,
  markSyncFileError,
  upsertSyncedFile
} from '@main/db/repos/syncFiles'
import { putObjectFile } from '@main/providers/s3'
import { b2PublicUrl, putB2ObjectFile } from '@main/providers/backblaze'
import { loadSyncSecret } from './secrets'
import { createUploadContext, type UploadContext } from './uploadContext'
import { scanImageFiles, type ScannedImage } from './scanner'
import { buildObjectKey, buildPublicUrl } from './objectKey'
import { shouldUploadFile } from './shouldUpload'
import { assertReadyToSync } from './validate'

let runInProgress = false
let cancelRequested = false
let pauseRequested = false

export function isSyncRunInProgress(): boolean {
  return runInProgress
}

export function requestCancelSyncRun(): void {
  cancelRequested = true
  pauseRequested = false
}

/** Cooperative pause between files (current upload still finishes). */
export function requestPauseSyncRun(): void {
  if (!runInProgress) return
  pauseRequested = true
  cancelRequested = false
}

function shouldStopBatch(): 'cancel' | 'pause' | null {
  if (cancelRequested) return 'cancel'
  if (pauseRequested) return 'pause'
  return null
}

function emptyResult(): SyncRunResult {
  return {
    scanned: 0,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    cancelled: false,
    paused: false
  }
}

async function uploadOne(
  ctx: UploadContext,
  file: ScannedImage,
  options: { force?: boolean } = {}
): Promise<'uploaded' | 'skipped'> {
  const md5 = await md5File(file.absolutePath)
  const existing = findSyncFileByPath(file.relativePath)
  if (
    !options.force &&
    existing?.status === 'synced' &&
    existing.publicUrl &&
    !shouldUploadFile(existing.md5, md5)
  ) {
    return 'skipped'
  }

  const objectKey = buildObjectKey(ctx.prefix, file.relativePath)
  if (ctx.b2) {
    await putB2ObjectFile(ctx.client, ctx.b2, objectKey, file.absolutePath)
  } else {
    await putObjectFile(ctx.client, ctx.bucket, objectKey, file.absolutePath)
  }
  const publicUrl = ctx.b2
    ? b2PublicUrl(ctx.b2.publicBaseUrl, objectKey)
    : buildPublicUrl(ctx.publicBaseUrl, objectKey)
  upsertSyncedFile({
    relativePath: file.relativePath,
    md5,
    objectKey,
    publicUrl,
    byteSize: file.byteSize,
    status: 'synced',
    lastError: null
  })
  return 'uploaded'
}

export async function runSyncOnce(taskId = `sync-${Date.now().toString(36)}`): Promise<SyncRunResult> {
  if (runInProgress) {
    throw new AppError('SYNC_BUSY', '同步正在进行中')
  }

  const settings = getSyncSettings()
  assertReadyToSync(settings)
  const secret = loadSyncSecret()
  if (!secret) {
    throw new AppError('S3_SECRET_MISSING', '缺少 Application Key / Secret（请填写并保存）')
  }

  runInProgress = true
  cancelRequested = false
  pauseRequested = false
  const result = emptyResult()

  const ctx = createUploadContext(secret)
  try {
    const files = scanImageFiles(settings.watchFolder!)
    result.scanned = files.length
    if (files.length === 0) {
      emitTaskProgress({
        taskId,
        phase: 'done',
        current: 0,
        total: 0,
        message: '目录中没有可同步的图片或视频'
      })
      return result
    }

    for (let i = 0; i < files.length; i += 1) {
      const stop = shouldStopBatch()
      if (stop === 'cancel') {
        result.cancelled = true
        break
      }
      if (stop === 'pause') {
        result.paused = true
        break
      }
      const file = files[i]!
      emitTaskProgress({
        taskId,
        phase: 'syncing',
        current: i + 1,
        total: files.length,
        message: file.relativePath
      })
      try {
        const outcome = await uploadOne(ctx, file)
        if (outcome === 'skipped') result.skipped += 1
        else result.uploaded += 1
      } catch (error) {
        result.failed += 1
        const message = error instanceof Error ? error.message : String(error)
        markSyncFileError(file.relativePath, message)
        log.warn('Sync file failed', { path: file.relativePath, error })
      }
    }

    emitTaskProgress({
      taskId,
      phase: result.cancelled ? 'cancelled' : result.paused ? 'paused' : 'done',
      current: files.length,
      total: files.length,
      message: summarizeResult(result)
    })
    return result
  } finally {
    ctx.client.destroy()
    runInProgress = false
    cancelRequested = false
    pauseRequested = false
  }
}

/** Re-upload only rows currently marked error. */
export async function runSyncRetryFailed(
  taskId = `sync-retry-${Date.now().toString(36)}`
): Promise<SyncRunResult> {
  if (runInProgress) {
    throw new AppError('SYNC_BUSY', '同步正在进行中')
  }

  const settings = getSyncSettings()
  assertReadyToSync(settings)
  const secret = loadSyncSecret()
  if (!secret) {
    throw new AppError('S3_SECRET_MISSING', '缺少 Application Key / Secret（请填写并保存）')
  }

  const failedPaths = listFailedRelativePaths()
  const result = emptyResult()
  result.scanned = failedPaths.length
  if (failedPaths.length === 0) {
    return result
  }

  runInProgress = true
  cancelRequested = false
  pauseRequested = false
  const ctx = createUploadContext(secret)
  const root = settings.watchFolder!

  try {
    for (let i = 0; i < failedPaths.length; i += 1) {
      const stop = shouldStopBatch()
      if (stop === 'cancel') {
        result.cancelled = true
        break
      }
      if (stop === 'pause') {
        result.paused = true
        break
      }
      const relativePath = failedPaths[i]!
      const absolutePath = join(root, ...relativePath.split('/'))
      emitTaskProgress({
        taskId,
        phase: 'retrying',
        current: i + 1,
        total: failedPaths.length,
        message: relativePath
      })

      if (!existsSync(absolutePath)) {
        result.failed += 1
        markSyncFileError(relativePath, '本地文件已不存在，无法重试')
        continue
      }

      try {
        const st = statSync(absolutePath)
        await uploadOne(
          ctx,
          { absolutePath, relativePath, byteSize: st.size },
          { force: true }
        )
        result.uploaded += 1
      } catch (error) {
        result.failed += 1
        const message = error instanceof Error ? error.message : String(error)
        markSyncFileError(relativePath, message)
        log.warn('Retry sync failed', { path: relativePath, error })
      }
    }

    emitTaskProgress({
      taskId,
      phase: result.cancelled ? 'cancelled' : result.paused ? 'paused' : 'done',
      current: failedPaths.length,
      total: failedPaths.length,
      message: summarizeResult(result)
    })
    return result
  } finally {
    ctx.client.destroy()
    runInProgress = false
    cancelRequested = false
    pauseRequested = false
  }
}

function summarizeResult(result: SyncRunResult): string {
  const parts = [
    `uploaded=${result.uploaded}`,
    `skipped=${result.skipped}`,
    `failed=${result.failed}`
  ]
  if (result.paused) {
    parts.push('已暂停，可点击「继续」')
  } else if (result.failed > 0) {
    parts.push('可点击「重试失败项」再次上传')
  }
  return parts.join(' ')
}
