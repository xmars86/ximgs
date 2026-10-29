export type SyncProviderId = 'b2' | 'r2' | 'aws' | 'oss' | 'cos' | 's3'

export type SyncSseMode = '' | 'AES256'

export interface SyncConfigPublic {
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
  /** True when a secret is stored; never returns plaintext secret. */
  hasSecretAccessKey: boolean
}

export interface SyncConfigUpdate {
  watchFolder?: string | null
  intervalMinutes?: number
  autoStart?: boolean
  objectPrefix?: string
  provider?: SyncProviderId
  endpoint?: string
  region?: string
  bucket?: string
  publicBaseUrl?: string
  accessKeyId?: string
  sseMode?: SyncSseMode | string
  /** Omit or empty to keep existing secret. */
  secretAccessKey?: string
}

export type SyncFileStatus = 'pending' | 'synced' | 'error' | 'skipped'

export interface SyncFileDto {
  id: number
  relativePath: string
  md5: string | null
  objectKey: string | null
  publicUrl: string | null
  status: SyncFileStatus | string
  lastError: string | null
  byteSize: number | null
  syncedAt: string | null
  updatedAt: string
  /** Soft-deleted into gallery recycle bin. */
  isTrashed: boolean
  trashedAt: string | null
  /** Client team-cache local thumb path (main process); never remote bytes. */
  thumbLocalPath?: string | null
}

export interface SyncRunResult {
  scanned: number
  uploaded: number
  skipped: number
  failed: number
  cancelled: boolean
  /** Stopped between files; next runNow continues via MD5 skip (no multipart resume). */
  paused: boolean
}

/** How a sync batch was started. */
export type SyncRunTrigger = 'manual' | 'scheduled' | 'retry'

/** Persisted sync batch summary (SQLite sync_runs). */
export interface SyncRunDto {
  id: number
  taskId: string
  trigger: SyncRunTrigger
  startedAt: string
  finishedAt: string
  scanned: number
  uploaded: number
  skipped: number
  failed: number
  cancelled: boolean
  errorMessage: string | null
  watchFolder: string | null
  bucket: string | null
}

export interface SyncRunListResult {
  items: SyncRunDto[]
}

/** Days of sync_runs history kept on disk. */
export const SYNC_RUN_RETENTION_DAYS = 90

export interface SyncStatusDto {
  isSchedulerRunning: boolean
  isRunInProgress: boolean
  /** True after a cooperative pause; 继续 / runNow clears it. */
  canResume: boolean
  intervalMinutes: number
  watchFolder: string | null
  /** ISO time when the next scheduled tick is due (set when scheduler starts / fires). */
  nextDueAt: string | null
  lastRunAt: string | null
  lastResult: SyncRunResult | null
  lastError: string | null
  failedCount?: number
}

export interface SyncFileListResult {
  items: SyncFileDto[]
  total: number
}

export interface SyncSetupChecklist {
  hasWatchFolder: boolean
  hasProviderConfig: boolean
  hasSecret: boolean
  hasPublicBaseUrl: boolean
  readyToSync: boolean
  missing: string[]
  provider: SyncProviderId
}

export interface SingleUploadResult {
  uploaded: boolean
  deduplicated: boolean
  file: SyncFileDto
}

export interface MultiUploadResult {
  uploaded: number
  deduplicated: number
  failed: number
  errors: string[]
  /** Public URLs from successful / deduped uploads (for clipboard). */
  urls: string[]
  /** Last successful (or deduped) file, for preview / navigation. */
  lastFile: SyncFileDto | null
}

export interface SyncFileQuery {
  limit?: number
  offset?: number
  search?: string
  status?: string
  /** Folder path prefix (posix, no trailing slash). Empty = library root. */
  pathPrefix?: string
  /**
   * When true with pathPrefix (or root): only files directly in that folder
   * (not nested). Folders are returned separately via sync.browseFiles.
   */
  directOnly?: boolean
  /** When true, list only recycle-bin rows; default excludes trashed. */
  trashOnly?: boolean
}

export interface SyncFolderDto {
  name: string
  path: string
  /** Number of matching files under this folder (recursive). */
  fileCount: number
}

export interface SyncBrowseResult {
  pathPrefix: string
  folders: SyncFolderDto[]
  items: SyncFileDto[]
  total: number
}

/** One local-calendar day in the upload chart. */
export interface SyncDailyUploadPoint {
  /** YYYY-MM-DD in local time */
  day: string
  count: number
}

export interface SyncDailyUploadStats {
  days: SyncDailyUploadPoint[]
  total: number
}

export interface SyncFileStatusCounts {
  all: number
  synced: number
  pending: number
  error: number
  skipped: number
  /** Total byte_size of synced rows (for subtitle). */
  totalBytes: number
}

export const DEFAULT_SYNC_INTERVAL_MINUTES = 60
export const MIN_SYNC_INTERVAL_MINUTES = 1
export const MAX_SYNC_INTERVAL_MINUTES = 1440
export const DEFAULT_SYNC_PROVIDER: SyncProviderId = 'b2'
