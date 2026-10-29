import { log } from '@main/runtime/logger'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import {
  getLatestSyncRun,
  insertSyncRun,
  purgeSyncRunsOlderThan,
  SYNC_RUN_RETENTION_DAYS,
  toSyncRunResult
} from '@main/db/repos/syncRuns'
import type { SyncRunResult, SyncRunTrigger } from '@shared/sync'
import {
  isSyncRunInProgress,
  requestCancelSyncRun,
  requestPauseSyncRun,
  runSyncOnce,
  runSyncRetryFailed
} from './runner'

let timer: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null
let lastResult: SyncRunResult | null = null
let lastError: string | null = null
/** After cooperative pause; cleared when a new run starts or cancel is requested. */
let canResume = false
/** When the next setInterval tick is expected (ISO). Cleared when stopped. */
let nextDueAt: string | null = null
let hydrated = false

export function isSchedulerRunning(): boolean {
  return timer !== null
}

function armNextDue(intervalMs: number, fromMs = Date.now()): void {
  nextDueAt = new Date(fromMs + intervalMs).toISOString()
}

export function getSchedulerSnapshot() {
  ensureHydratedFromDb()
  const settings = getSyncSettings()
  return {
    isSchedulerRunning: timer !== null,
    isRunInProgress: isSyncRunInProgress(),
    canResume,
    intervalMinutes: settings.intervalMinutes,
    watchFolder: settings.watchFolder,
    nextDueAt: timer !== null ? nextDueAt : null,
    lastRunAt,
    lastResult,
    lastError
  }
}

/** Clears in-memory last-run fields after sync_runs table is wiped. */
export function clearLastRunSnapshot(): void {
  lastRunAt = null
  lastResult = null
  lastError = null
  canResume = false
  hydrated = true
}

export function startScheduler(): void {
  const settings = getSyncSettings()
  stopScheduler()
  const ms = settings.intervalMinutes * 60 * 1000
  armNextDue(ms)
  timer = setInterval(() => {
    const periodMs = getSyncSettings().intervalMinutes * 60 * 1000
    armNextDue(periodMs)
    void tick()
  }, ms)
  log.info('Sync scheduler started', { intervalMinutes: settings.intervalMinutes, nextDueAt })
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    nextDueAt = null
    log.info('Sync scheduler stopped')
  }
}

export function restartSchedulerIfRunning(): void {
  if (!timer) return
  startScheduler()
}

async function tick(): Promise<void> {
  if (isSyncRunInProgress()) {
    return
  }
  await runTracked('scheduled', (taskId) => runSyncOnce(taskId))
}

/** Request cooperative cancel of the in-flight sync/retry loop (between files). */
export function cancelRunTracked(): ReturnType<typeof getSchedulerSnapshot> {
  if (isSyncRunInProgress()) {
    requestCancelSyncRun()
    canResume = false
    log.info('Sync run cancel requested')
  }
  return getSchedulerSnapshot()
}

/** Request cooperative pause; remaining files can be continued via runNow (MD5 skip). */
export function pauseRunTracked(): ReturnType<typeof getSchedulerSnapshot> {
  if (isSyncRunInProgress()) {
    requestPauseSyncRun()
    log.info('Sync run pause requested')
  }
  return getSchedulerSnapshot()
}

export async function runNowTracked(): Promise<SyncRunResult> {
  return runTracked('manual', (taskId) => runSyncOnce(taskId))
}

export async function retryFailedTracked(): Promise<SyncRunResult> {
  return runTracked('retry', (taskId) => runSyncRetryFailed(taskId))
}

async function runTracked(
  trigger: SyncRunTrigger,
  exec: (taskId: string) => Promise<SyncRunResult>
): Promise<SyncRunResult> {
  const taskId = `sync-${trigger}-${Date.now().toString(36)}`
  const startedAt = new Date().toISOString()
  lastError = null
  canResume = false
  try {
    const result = await exec(taskId)
    const finishedAt = new Date().toISOString()
    lastResult = result
    lastRunAt = finishedAt
    canResume = Boolean(result.paused)
    persistRun({
      taskId,
      trigger,
      startedAt,
      finishedAt,
      result,
      errorMessage: null
    })
    return result
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    lastRunAt = finishedAt
    lastResult = null
    canResume = false
    persistRun({
      taskId,
      trigger,
      startedAt,
      finishedAt,
      result: null,
      errorMessage: message
    })
    if (trigger === 'scheduled') {
      log.warn('Scheduled sync failed', error)
      return {
        scanned: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        cancelled: false,
        paused: false
      }
    }
    throw error
  }
}

function persistRun(input: {
  taskId: string
  trigger: SyncRunTrigger
  startedAt: string
  finishedAt: string
  result: SyncRunResult | null
  errorMessage: string | null
}): void {
  try {
    const settings = getSyncSettings()
    insertSyncRun({
      taskId: input.taskId,
      trigger: input.trigger,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      result: input.result,
      errorMessage: input.errorMessage,
      watchFolder: settings.watchFolder,
      bucket: settings.bucket || null
    })
    const purged = purgeSyncRunsOlderThan(SYNC_RUN_RETENTION_DAYS)
    if (purged > 0) {
      log.info('Purged old sync runs', { purged, retentionDays: SYNC_RUN_RETENTION_DAYS })
    }
  } catch (error) {
    log.warn('Failed to persist sync run', error)
  }
}

function ensureHydratedFromDb(): void {
  if (hydrated) return
  hydrated = true
  try {
    const latest = getLatestSyncRun()
    if (!latest) return
    if (!lastRunAt) {
      lastRunAt = latest.finishedAt
      lastResult = toSyncRunResult(latest)
      lastError = latest.errorMessage
    }
  } catch (error) {
    log.warn('Failed to hydrate sync run state', error)
  }
}

export function bootstrapSchedulerFromSettings(): void {
  ensureHydratedFromDb()
  try {
    purgeSyncRunsOlderThan(SYNC_RUN_RETENTION_DAYS)
  } catch (error) {
    log.warn('Failed to purge sync runs on bootstrap', error)
  }
  const settings = getSyncSettings()
  if (!settings.autoStart || !settings.watchFolder) {
    return
  }
  startScheduler()
}
