import { queryOne, runSql, persistDatabase } from '../client'
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  DEFAULT_SYNC_PROVIDER,
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
  type SyncProviderId,
  type SyncSseMode
} from '@shared/sync'

export interface SyncSettingsRow {
  watchFolder: string | null
  intervalMinutes: number
  autoStart: boolean
  objectPrefix: string
  provider: SyncProviderId
  endpoint: string
  region: string
  bucket: string
  publicBaseUrl: string
  accessKeyId: string
  sseMode: SyncSseMode | string
}

interface RawRow {
  watch_folder: string | null
  interval_minutes: number
  auto_start: number
  object_prefix: string
  provider?: string
  endpoint: string
  region: string
  bucket: string
  public_base_url: string
  access_key_id: string
  sse_mode?: string
}

function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_SYNC_INTERVAL_MINUTES
  return Math.min(
    MAX_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(minutes))
  )
}

function normalizeProvider(value: string | undefined): SyncProviderId {
  return value === 's3' ? 's3' : DEFAULT_SYNC_PROVIDER
}

function mapRow(row: RawRow): SyncSettingsRow {
  return {
    watchFolder: row.watch_folder ? String(row.watch_folder) : null,
    intervalMinutes: clampInterval(Number(row.interval_minutes)),
    autoStart: Number(row.auto_start) === 1,
    objectPrefix: String(row.object_prefix ?? ''),
    provider: normalizeProvider(row.provider),
    endpoint: String(row.endpoint ?? ''),
    region: String(row.region ?? ''),
    bucket: String(row.bucket ?? ''),
    publicBaseUrl: String(row.public_base_url ?? ''),
    accessKeyId: String(row.access_key_id ?? ''),
    sseMode: String(row.sse_mode ?? '')
  }
}

export function getSyncSettings(): SyncSettingsRow {
  const row = queryOne<RawRow>(
    `SELECT watch_folder, interval_minutes, auto_start, object_prefix, provider, endpoint, region,
            bucket, public_base_url, access_key_id, sse_mode
     FROM sync_settings WHERE id = 1`
  )
  if (!row) {
    runSql(`INSERT OR IGNORE INTO sync_settings (id, interval_minutes) VALUES (1, ?)`, [
      DEFAULT_SYNC_INTERVAL_MINUTES
    ])
    persistDatabase()
    return {
      watchFolder: null,
      intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
      autoStart: false,
      objectPrefix: '',
      provider: DEFAULT_SYNC_PROVIDER,
      endpoint: '',
      region: '',
      bucket: '',
      publicBaseUrl: '',
      accessKeyId: '',
      sseMode: ''
    }
  }
  return mapRow(row)
}

export function updateSyncSettings(patch: Partial<SyncSettingsRow>): SyncSettingsRow {
  const current = getSyncSettings()
  const next: SyncSettingsRow = {
    watchFolder: patch.watchFolder !== undefined ? patch.watchFolder : current.watchFolder,
    intervalMinutes:
      patch.intervalMinutes !== undefined
        ? clampInterval(patch.intervalMinutes)
        : current.intervalMinutes,
    autoStart: patch.autoStart !== undefined ? patch.autoStart : current.autoStart,
    objectPrefix: patch.objectPrefix !== undefined ? patch.objectPrefix : current.objectPrefix,
    provider: patch.provider !== undefined ? normalizeProvider(patch.provider) : current.provider,
    endpoint: patch.endpoint !== undefined ? patch.endpoint : current.endpoint,
    region: patch.region !== undefined ? patch.region : current.region,
    bucket: patch.bucket !== undefined ? patch.bucket : current.bucket,
    publicBaseUrl:
      patch.publicBaseUrl !== undefined ? patch.publicBaseUrl : current.publicBaseUrl,
    accessKeyId: patch.accessKeyId !== undefined ? patch.accessKeyId : current.accessKeyId,
    sseMode: patch.sseMode !== undefined ? patch.sseMode : current.sseMode
  }

  runSql(
    `UPDATE sync_settings SET
      watch_folder = ?,
      interval_minutes = ?,
      auto_start = ?,
      object_prefix = ?,
      provider = ?,
      endpoint = ?,
      region = ?,
      bucket = ?,
      public_base_url = ?,
      access_key_id = ?,
      sse_mode = ?,
      updated_at = datetime('now')
     WHERE id = 1`,
    [
      next.watchFolder,
      next.intervalMinutes,
      next.autoStart ? 1 : 0,
      next.objectPrefix,
      next.provider,
      next.endpoint,
      next.region,
      next.bucket,
      next.publicBaseUrl,
      next.accessKeyId,
      next.sseMode
    ]
  )
  persistDatabase()
  return getSyncSettings()
}
