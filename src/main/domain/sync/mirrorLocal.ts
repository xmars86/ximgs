import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { app } from 'electron'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import { log } from '@main/runtime/logger'
import { resolveLocalMediaPath } from './localPath'

/** Immediate try + this many delayed retries. */
export const MIRROR_DELAYED_RETRIES = 3

/** Backoff between delayed retries (ms). */
export const MIRROR_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const

export type MirrorCopyResult = 'ok' | 'skip' | 'no_watch'

type MirrorJob = {
  id: string
  /** Readable path for this attempt (original or staged). */
  sourcePath: string
  relativePath: string
  /** 0 = immediate; 1..3 = delayed retries. */
  tryIndex: number
  staged: boolean
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Copy an uploaded file into `watchFolder/relativePath` (same rules as cloud key without prefix).
 * Never throws. On failure, stages bytes under userData and retries with delay.
 */
export function scheduleMirrorToWatchFolder(sourcePath: string, relativePath: string): void {
  if (!sourcePath?.trim() || !relativePath?.trim()) {
    log.warn('Skip local mirror: missing source or relative path', { sourcePath, relativePath })
    return
  }
  if (!existsSync(sourcePath)) {
    log.warn('Skip local mirror: source file missing', { sourcePath, relativePath })
    return
  }
  const watchFolder = getSyncSettings().watchFolder?.trim() ?? ''
  log.info('Local mirror start', { sourcePath, relativePath, watchFolder: watchFolder || null })
  runMirrorJob({
    id: randomUUID(),
    sourcePath,
    relativePath,
    tryIndex: 0,
    staged: false
  })
}

/**
 * Pure copy into a given watch root. Used by runtime + tests.
 * Overwrites existing destination. Skips when source is already the dest path.
 */
export function copyUploadToWatchFolder(
  sourcePath: string,
  relativePath: string,
  watchFolder: string
): MirrorCopyResult {
  const root = watchFolder.trim()
  if (!root) return 'no_watch'

  const dest = resolveLocalMediaPath(root, relativePath)
  if (!dest) {
    throw new Error(`invalid relative path for local mirror: ${relativePath}`)
  }

  const srcAbs = resolve(sourcePath)
  if (!existsSync(srcAbs)) {
    throw new Error(`source missing: ${srcAbs}`)
  }

  if (existsSync(dest) && resolve(dest) === srcAbs) {
    return 'skip'
  }

  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(srcAbs, dest)
  if (!existsSync(dest)) {
    throw new Error(`copy reported ok but destination missing: ${dest}`)
  }
  return 'ok'
}

function mirrorPendingDir(): string {
  const dir = join(app.getPath('userData'), 'mirror-pending')
  mkdirSync(dir, { recursive: true })
  return dir
}

function stageSource(sourcePath: string, jobId: string): string | null {
  try {
    const ext = extname(sourcePath) || '.bin'
    const stagedPath = join(mirrorPendingDir(), `${jobId}${ext}`)
    copyFileSync(resolve(sourcePath), stagedPath)
    return stagedPath
  } catch (error) {
    log.warn('Failed to stage file for local mirror retry', { sourcePath, error })
    return null
  }
}

function cleanupStaged(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // ignore
  }
}

function runMirrorJob(job: MirrorJob): void {
  const watchFolder = getSyncSettings().watchFolder?.trim() ?? ''
  try {
    const result = copyUploadToWatchFolder(job.sourcePath, job.relativePath, watchFolder)
    if (result === 'no_watch') {
      log.warn('Skip local mirror: watch folder not configured', {
        relativePath: job.relativePath
      })
      if (job.staged) cleanupStaged(job.sourcePath)
      return
    }
    if (result === 'ok') {
      const dest = resolveLocalMediaPath(watchFolder, job.relativePath)
      log.info('Mirrored upload to watch folder', {
        relativePath: job.relativePath,
        dest,
        tryIndex: job.tryIndex
      })
    } else if (result === 'skip') {
      log.info('Local mirror skipped (source already at destination)', {
        relativePath: job.relativePath,
        tryIndex: job.tryIndex
      })
    }
    if (job.staged) cleanupStaged(job.sourcePath)
  } catch (error) {
    scheduleRetryOrGiveUp(job, error)
  }
}

function scheduleRetryOrGiveUp(job: MirrorJob, error: unknown): void {
  log.warn('Local mirror copy failed', {
    relativePath: job.relativePath,
    tryIndex: job.tryIndex,
    error
  })

  if (job.tryIndex >= MIRROR_DELAYED_RETRIES) {
    log.warn('Local mirror gave up after retries; cloud upload remains successful', {
      relativePath: job.relativePath,
      sourcePath: job.sourcePath,
      error
    })
    if (job.staged) cleanupStaged(job.sourcePath)
    return
  }

  let nextSource = job.sourcePath
  let staged = job.staged
  if (!staged) {
    const stagedPath = stageSource(job.sourcePath, job.id)
    if (!stagedPath) {
      log.warn('Local mirror abandoned: cannot stage source for retry; cloud upload remains successful', {
        relativePath: job.relativePath
      })
      return
    }
    nextSource = stagedPath
    staged = true
  } else if (!existsSync(job.sourcePath)) {
    log.warn('Local mirror abandoned: staged source missing; cloud upload remains successful', {
      relativePath: job.relativePath
    })
    return
  }

  const nextIndex = job.tryIndex + 1
  const delay = MIRROR_RETRY_DELAYS_MS[Math.min(job.tryIndex, MIRROR_RETRY_DELAYS_MS.length - 1)]!

  const timer = setTimeout(() => {
    pendingTimers.delete(job.id)
    runMirrorJob({
      id: job.id,
      sourcePath: nextSource,
      relativePath: job.relativePath,
      tryIndex: nextIndex,
      staged
    })
  }, delay)
  pendingTimers.set(job.id, timer)

  log.info('Scheduled local mirror retry', {
    relativePath: job.relativePath,
    nextTryIndex: nextIndex,
    delayMs: delay
  })
}

/** Test / shutdown helper: cancel pending delayed mirror retries. */
export function clearPendingMirrorRetries(): void {
  for (const timer of pendingTimers.values()) {
    clearTimeout(timer)
  }
  pendingTimers.clear()
}
