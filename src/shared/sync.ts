export type SyncProviderId = 'b2' | 's3'

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
}

export interface SyncRunResult {
  scanned: number
  uploaded: number
  skipped: number
  failed: number
  cancelled: boolean
}

export interface SyncStatusDto {
  isSchedulerRunning: boolean
  isRunInProgress: boolean
  intervalMinutes: number
  watchFolder: string | null
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
