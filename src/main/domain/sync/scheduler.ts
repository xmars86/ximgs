import { log } from '@main/runtime/logger'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import {
  isSyncRunInProgress,
  requestCancelSyncRun,
  runSyncOnce,
  runSyncRetryFailed
} from './runner'

let timer: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null
let lastResult: Awaited<ReturnType<typeof runSyncOnce>> | null = null
let lastError: string | null = null

export function isSchedulerRunning(): boolean {
  return timer !== null
}

export function getSchedulerSnapshot() {
  const settings = getSyncSettings()
  return {
    isSchedulerRunning: timer !== null,
    isRunInProgress: isSyncRunInProgress(),
    intervalMinutes: settings.intervalMinutes,
    watchFolder: settings.watchFolder,
    lastRunAt,
    lastResult,
    lastError
  }
}

export function startScheduler(): void {
  const settings = getSyncSettings()
  stopScheduler()
  const ms = settings.intervalMinutes * 60 * 1000
  timer = setInterval(() => {
    void tick()
  }, ms)
  log.info('Sync scheduler started', { intervalMinutes: settings.intervalMinutes })
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
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
  try {
    lastError = null
    lastResult = await runSyncOnce(`sync-auto-${Date.now().toString(36)}`)
    lastRunAt = new Date().toISOString()
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    log.warn('Scheduled sync failed', error)
  }
}

/** Request cooperative cancel of the in-flight sync/retry loop (between files). */
export function cancelRunTracked(): ReturnType<typeof getSchedulerSnapshot> {
  if (isSyncRunInProgress()) {
    requestCancelSyncRun()
    log.info('Sync run cancel requested')
  }
  return getSchedulerSnapshot()
}

export async function runNowTracked(): Promise<Awaited<ReturnType<typeof runSyncOnce>>> {
  lastError = null
  try {
    lastResult = await runSyncOnce(`sync-manual-${Date.now().toString(36)}`)
    lastRunAt = new Date().toISOString()
    return lastResult
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

export async function retryFailedTracked(): Promise<Awaited<ReturnType<typeof runSyncRetryFailed>>> {
  lastError = null
  try {
    lastResult = await runSyncRetryFailed(`sync-retry-${Date.now().toString(36)}`)
    lastRunAt = new Date().toISOString()
    return lastResult
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

export function bootstrapSchedulerFromSettings(): void {
  const settings = getSyncSettings()
  if (!settings.autoStart || !settings.watchFolder) {
    return
  }
  startScheduler()
}
