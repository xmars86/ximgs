import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSyncSettings = vi.fn()
const isSyncRunInProgress = vi.fn(() => false)

vi.mock('../../src/main/db/repos/syncSettings', () => ({
  getSyncSettings: () => getSyncSettings()
}))

vi.mock('../../src/main/db/repos/syncRuns', () => ({
  getLatestSyncRun: vi.fn(() => null),
  insertSyncRun: vi.fn(),
  purgeSyncRunsOlderThan: vi.fn(() => 0),
  SYNC_RUN_RETENTION_DAYS: 90,
  toSyncRunResult: vi.fn()
}))

vi.mock('../../src/main/domain/sync/runner', () => ({
  isSyncRunInProgress: () => isSyncRunInProgress(),
  requestCancelSyncRun: vi.fn(),
  requestPauseSyncRun: vi.fn(),
  runSyncOnce: vi.fn(),
  runSyncRetryFailed: vi.fn()
}))

vi.mock('../../src/main/runtime/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

describe('sync scheduler start/stop + nextDueAt', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    getSyncSettings.mockReturnValue({
      intervalMinutes: 5,
      watchFolder: 'D:/assets',
      autoStart: true
    })
    isSyncRunInProgress.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets nextDueAt on start and clears on stop', async () => {
    const sch = await import('../../src/main/domain/sync/scheduler')
    sch.stopScheduler()
    expect(sch.getSchedulerSnapshot().isSchedulerRunning).toBe(false)
    expect(sch.getSchedulerSnapshot().nextDueAt).toBeNull()

    const before = Date.now()
    sch.startScheduler()
    const snap = sch.getSchedulerSnapshot()
    expect(snap.isSchedulerRunning).toBe(true)
    expect(snap.nextDueAt).toBeTruthy()
    const due = new Date(snap.nextDueAt!).getTime()
    expect(due).toBeGreaterThanOrEqual(before + 5 * 60_000 - 50)
    expect(due).toBeLessThanOrEqual(before + 5 * 60_000 + 50)

    sch.stopScheduler()
    expect(sch.getSchedulerSnapshot().isSchedulerRunning).toBe(false)
    expect(sch.getSchedulerSnapshot().nextDueAt).toBeNull()
  })

  it('re-arms nextDueAt when interval changes via restart', async () => {
    const sch = await import('../../src/main/domain/sync/scheduler')
    sch.startScheduler()
    const firstDue = sch.getSchedulerSnapshot().nextDueAt

    getSyncSettings.mockReturnValue({
      intervalMinutes: 1,
      watchFolder: 'D:/assets',
      autoStart: true
    })
    sch.startScheduler()
    const secondDue = sch.getSchedulerSnapshot().nextDueAt
    expect(secondDue).not.toBe(firstDue)
    const dueMs = new Date(secondDue!).getTime() - Date.now()
    expect(dueMs).toBeGreaterThan(50_000)
    expect(dueMs).toBeLessThanOrEqual(60_000 + 50)

    sch.stopScheduler()
  })
})
