import { flushPersist, queryAll, queryOne, runSql } from '../client'
import {
  SYNC_RUN_RETENTION_DAYS,
  type SyncRunDto,
  type SyncRunResult,
  type SyncRunTrigger
} from '@shared/sync'

export { SYNC_RUN_RETENTION_DAYS }

interface RawRow {
  id: number
  task_id: string
  trigger: string
  started_at: string
  finished_at: string
  scanned: number
  uploaded: number
  skipped: number
  failed: number
  cancelled: number
  error_message: string | null
  watch_folder: string | null
  bucket: string | null
}

function mapRow(row: RawRow): SyncRunDto {
  return {
    id: Number(row.id),
    taskId: String(row.task_id),
    trigger: normalizeTrigger(row.trigger),
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    scanned: Number(row.scanned) || 0,
    uploaded: Number(row.uploaded) || 0,
    skipped: Number(row.skipped) || 0,
    failed: Number(row.failed) || 0,
    cancelled: Number(row.cancelled) === 1,
    errorMessage: row.error_message == null ? null : String(row.error_message),
    watchFolder: row.watch_folder == null ? null : String(row.watch_folder),
    bucket: row.bucket == null ? null : String(row.bucket)
  }
}

function normalizeTrigger(value: string): SyncRunTrigger {
  if (value === 'scheduled' || value === 'retry') return value
  return 'manual'
}

export interface InsertSyncRunInput {
  taskId: string
  trigger: SyncRunTrigger
  startedAt: string
  finishedAt: string
  result?: SyncRunResult | null
  errorMessage?: string | null
  watchFolder?: string | null
  bucket?: string | null
}

export function insertSyncRun(input: InsertSyncRunInput): SyncRunDto {
  const result = input.result
  runSql(
    `INSERT INTO sync_runs (
      task_id, trigger, started_at, finished_at,
      scanned, uploaded, skipped, failed, cancelled,
      error_message, watch_folder, bucket
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.taskId,
      input.trigger,
      input.startedAt,
      input.finishedAt,
      result?.scanned ?? 0,
      result?.uploaded ?? 0,
      result?.skipped ?? 0,
      result?.failed ?? 0,
      result?.cancelled ? 1 : 0,
      input.errorMessage ?? null,
      input.watchFolder ?? null,
      input.bucket ?? null
    ]
  )
  flushPersist()
  const row = queryOne<RawRow>(`SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1`)
  if (!row) {
    throw new Error('Failed to read inserted sync_run')
  }
  return mapRow(row)
}

export function listSyncRuns(limit = 100): SyncRunDto[] {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || 100))
  const rows = queryAll<RawRow>(
    `SELECT * FROM sync_runs ORDER BY finished_at DESC, id DESC LIMIT ?`,
    [safeLimit]
  )
  return rows.map(mapRow)
}

export function getLatestSyncRun(): SyncRunDto | null {
  const row = queryOne<RawRow>(`SELECT * FROM sync_runs ORDER BY finished_at DESC, id DESC LIMIT 1`)
  return row ? mapRow(row) : null
}

export function getSyncRunById(id: number): SyncRunDto | null {
  const row = queryOne<RawRow>(`SELECT * FROM sync_runs WHERE id = ?`, [id])
  return row ? mapRow(row) : null
}

/** Delete runs whose finished_at is older than retentionDays (local calendar approx via UTC cutoff). */
export function purgeSyncRunsOlderThan(retentionDays = SYNC_RUN_RETENTION_DAYS): number {
  const days = Math.max(1, Math.floor(retentionDays) || SYNC_RUN_RETENTION_DAYS)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const before = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM sync_runs WHERE finished_at < ?`, [
    cutoff
  ])
  const count = Number(before?.c ?? 0)
  if (count <= 0) return 0
  runSql(`DELETE FROM sync_runs WHERE finished_at < ?`, [cutoff])
  flushPersist()
  return count
}

export function countSyncRuns(): number {
  const row = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM sync_runs`)
  return Number(row?.c ?? 0)
}

/** Delete all sync_runs rows (local history only; does not touch sync_files). */
export function clearAllSyncRuns(): { deleted: number } {
  const deleted = countSyncRuns()
  if (deleted <= 0) return { deleted: 0 }
  runSql(`DELETE FROM sync_runs`)
  flushPersist()
  return { deleted }
}

export function toSyncRunResult(run: SyncRunDto): SyncRunResult {
  return {
    scanned: run.scanned,
    uploaded: run.uploaded,
    skipped: run.skipped,
    failed: run.failed,
    cancelled: run.cancelled,
    paused: false
  }
}
