import { queryAll, queryOne, runSql, persistDatabase, flushPersist } from '../client'
import type {
  SyncBrowseResult,
  SyncFileDto,
  SyncFileListResult,
  SyncFileStatus,
  SyncFolderDto
} from '@shared/sync'

function normalizePathPrefix(pathPrefix?: string): string {
  return (pathPrefix ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

function buildListWhere(options: {
  search?: string
  status?: string
  pathPrefix?: string
  directOnly?: boolean
}): { whereSql: string; params: unknown[] } {
  const where: string[] = []
  const params: unknown[] = []
  if (options.status) {
    where.push(`status = ?`)
    params.push(options.status)
  }
  if (options.search?.trim()) {
    const like = `%${options.search.trim()}%`
    where.push(
      `(relative_path LIKE ? OR IFNULL(public_url, '') LIKE ? OR IFNULL(object_key, '') LIKE ?)`
    )
    params.push(like, like, like)
  }

  const prefix = normalizePathPrefix(options.pathPrefix)
  if (options.directOnly) {
    if (prefix) {
      // Direct children of prefix: prefix/name with no further slash
      where.push(`relative_path LIKE ?`)
      params.push(`${prefix}/%`)
      where.push(`instr(substr(relative_path, ?), '/') = 0`)
      params.push(prefix.length + 2)
    } else {
      where.push(`instr(relative_path, '/') = 0`)
    }
  } else if (prefix) {
    where.push(`(relative_path = ? OR relative_path LIKE ?)`)
    params.push(prefix, `${prefix}/%`)
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  }
}

interface RawRow {
  id: number
  relative_path: string
  md5: string | null
  object_key: string | null
  public_url: string | null
  status: string
  last_error: string | null
  byte_size: number | null
  synced_at: string | null
  updated_at: string
}

function mapRow(row: RawRow): SyncFileDto {
  return {
    id: Number(row.id),
    relativePath: String(row.relative_path),
    md5: row.md5 == null ? null : String(row.md5),
    objectKey: row.object_key == null ? null : String(row.object_key),
    publicUrl: row.public_url == null ? null : String(row.public_url),
    status: String(row.status),
    lastError: row.last_error == null ? null : String(row.last_error),
    byteSize: row.byte_size == null ? null : Number(row.byte_size),
    syncedAt: row.synced_at == null ? null : String(row.synced_at),
    updatedAt: String(row.updated_at)
  }
}

export function findSyncFileByPath(relativePath: string): SyncFileDto | undefined {
  const row = queryOne<RawRow>(
    `SELECT id, relative_path, md5, object_key, public_url, status, last_error, byte_size, synced_at, updated_at
     FROM sync_files WHERE relative_path = ?`,
    [relativePath]
  )
  return row ? mapRow(row) : undefined
}

export function findSyncedByMd5(md5: string): SyncFileDto | undefined {
  const row = queryOne<RawRow>(
    `SELECT id, relative_path, md5, object_key, public_url, status, last_error, byte_size, synced_at, updated_at
     FROM sync_files WHERE md5 = ? AND status = 'synced' AND public_url IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [md5]
  )
  return row ? mapRow(row) : undefined
}

export function getSyncFileById(id: number): SyncFileDto | undefined {
  const row = queryOne<RawRow>(
    `SELECT id, relative_path, md5, object_key, public_url, status, last_error, byte_size, synced_at, updated_at
     FROM sync_files WHERE id = ?`,
    [id]
  )
  return row ? mapRow(row) : undefined
}

export function deleteSyncFileById(id: number): boolean {
  const existing = getSyncFileById(id)
  if (!existing) return false
  runSql(`DELETE FROM sync_files WHERE id = ?`, [id])
  persistDatabase()
  return true
}

/** Clears all local sync/gallery file rows. Does not delete remote objects. */
export function clearAllSyncFiles(): { deleted: number } {
  const total = Number(
    queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM sync_files`)?.count ?? 0
  )
  if (total === 0) {
    return { deleted: 0 }
  }
  runSql(`DELETE FROM sync_files`)
  flushPersist()
  const remaining = Number(
    queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM sync_files`)?.count ?? 0
  )
  if (remaining > 0) {
    throw new Error(`清空失败：仍有 ${remaining} 条记录`)
  }
  return { deleted: total }
}

export function upsertSyncedFile(input: {
  relativePath: string
  md5: string
  objectKey: string
  publicUrl: string
  byteSize: number
  status: SyncFileStatus
  lastError?: string | null
}): void {
  const existing = findSyncFileByPath(input.relativePath)
  if (existing) {
    runSql(
      `UPDATE sync_files SET
        md5 = ?, object_key = ?, public_url = ?, status = ?, last_error = ?,
        byte_size = ?, synced_at = datetime('now'), updated_at = datetime('now')
       WHERE relative_path = ?`,
      [
        input.md5,
        input.objectKey,
        input.publicUrl,
        input.status,
        input.lastError ?? null,
        input.byteSize,
        input.relativePath
      ]
    )
  } else {
    runSql(
      `INSERT INTO sync_files (
        relative_path, md5, object_key, public_url, status, last_error, byte_size, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        input.relativePath,
        input.md5,
        input.objectKey,
        input.publicUrl,
        input.status,
        input.lastError ?? null,
        input.byteSize
      ]
    )
  }
  persistDatabase()
}

export function markSyncFileError(relativePath: string, errorMessage: string, md5?: string): void {
  const existing = findSyncFileByPath(relativePath)
  if (existing) {
    runSql(
      `UPDATE sync_files SET status = 'error', last_error = ?, md5 = COALESCE(?, md5), updated_at = datetime('now')
       WHERE relative_path = ?`,
      [errorMessage, md5 ?? null, relativePath]
    )
  } else {
    runSql(
      `INSERT INTO sync_files (relative_path, md5, status, last_error) VALUES (?, ?, 'error', ?)`,
      [relativePath, md5 ?? null, errorMessage]
    )
  }
  persistDatabase()
}

export function listSyncFiles(
  limit = 500,
  offset = 0,
  options: {
    search?: string
    status?: string
    pathPrefix?: string
    directOnly?: boolean
  } = {}
): SyncFileListResult {
  const { whereSql, params } = buildListWhere(options)
  const total = Number(
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_files ${whereSql}`,
      params
    )?.count ?? 0
  )
  const rows = queryAll<RawRow>(
    `SELECT id, relative_path, md5, object_key, public_url, status, last_error, byte_size, synced_at, updated_at
     FROM sync_files
     ${whereSql}
     ORDER BY updated_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, Math.min(Math.max(limit, 1), 500), Math.max(offset, 0)]
  )
  return { items: rows.map(mapRow), total }
}

/** Folder browser: child folders + files directly in the current path. */
export function browseSyncFiles(
  limit = 500,
  offset = 0,
  options: { search?: string; status?: string; pathPrefix?: string } = {}
): SyncBrowseResult {
  const pathPrefix = normalizePathPrefix(options.pathPrefix)
  const searching = Boolean(options.search?.trim())

  // Text search: flat results under current prefix (or whole library).
  if (searching) {
    const listed = listSyncFiles(limit, offset, {
      search: options.search,
      status: options.status,
      pathPrefix: pathPrefix || undefined,
      directOnly: false
    })
    return {
      pathPrefix,
      folders: [],
      items: listed.items,
      total: listed.total
    }
  }

  const folders = listChildFolders(pathPrefix, options.status)
  const listed = listSyncFiles(limit, offset, {
    status: options.status,
    pathPrefix,
    directOnly: true
  })
  return {
    pathPrefix,
    folders,
    items: listed.items,
    total: listed.total
  }
}

function listChildFolders(pathPrefix: string, status?: string): SyncFolderDto[] {
  const where: string[] = []
  const params: unknown[] = []
  if (status) {
    where.push(`status = ?`)
    params.push(status)
  }
  if (pathPrefix) {
    where.push(`relative_path LIKE ?`)
    params.push(`${pathPrefix}/%`)
  } else {
    where.push(`instr(relative_path, '/') > 0`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = queryAll<{ relative_path: string }>(
    `SELECT relative_path FROM sync_files ${whereSql}`,
    params
  )

  const counts = new Map<string, number>()
  const prefixLen = pathPrefix ? pathPrefix.length + 1 : 0
  for (const row of rows) {
    const rel = String(row.relative_path).replace(/\\/g, '/')
    const rest = prefixLen ? rel.slice(prefixLen) : rel
    const slash = rest.indexOf('/')
    if (slash <= 0) continue
    const name = rest.slice(0, slash)
    if (!name || name === '.' || name === '..') continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, fileCount]) => ({
      name,
      path: pathPrefix ? `${pathPrefix}/${name}` : name,
      fileCount
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export function listFailedRelativePaths(): string[] {
  const rows = queryAll<{ relative_path: string }>(
    `SELECT relative_path FROM sync_files WHERE status = 'error' ORDER BY updated_at DESC`
  )
  return rows.map((r) => String(r.relative_path))
}

export function countByStatus(): Record<string, number> {
  const rows = queryAll<{ status: string; count: number }>(
    `SELECT status, COUNT(*) AS count FROM sync_files GROUP BY status`
  )
  const out: Record<string, number> = {}
  for (const row of rows) {
    out[String(row.status)] = Number(row.count)
  }
  return out
}

export function sumSyncedBytes(): number {
  const row = queryOne<{ total: number | null }>(
    `SELECT SUM(byte_size) AS total FROM sync_files WHERE status = 'synced'`
  )
  return Number(row?.total ?? 0) || 0
}

/**
 * Count synced uploads grouped by local calendar day.
 * Window is slightly wider than `dayCount` to absorb UTC/local edge cases;
 * callers should fill a fixed series with `fillDailyUploadSeries`.
 */
export function countSyncedUploadsByLocalDay(dayCount = 7): Record<string, number> {
  const windowDays = Math.max(1, Math.min(dayCount, 31)) + 1
  const rows = queryAll<{ day: string; count: number }>(
    `SELECT date(synced_at, 'localtime') AS day, COUNT(*) AS count
     FROM sync_files
     WHERE status = 'synced'
       AND synced_at IS NOT NULL
       AND datetime(synced_at) >= datetime('now', ?)
     GROUP BY date(synced_at, 'localtime')`,
    [`-${windowDays} days`]
  )
  const out: Record<string, number> = {}
  for (const row of rows) {
    const day = String(row.day || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    out[day] = Number(row.count) || 0
  }
  return out
}
