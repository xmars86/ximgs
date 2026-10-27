import { queryAll, queryOne, runSql, persistDatabase } from '../client'
import type { AssetDto, AssetQuery, AssetListResult, TagDto } from '@shared/library'
import { listTagsForAsset } from './tags'
import { buildAssetMediaUrls } from '@main/domain/library/mediaUrl'

interface AssetJoinRow {
  id: number
  product_id: number
  store_id: number
  store_name: string
  store_slug: string
  platform: string
  asin_or_sku: string
  relative_path: string
  file_name: string
  asset_type: string
  version_kind: string
  md5: string | null
  width: number | null
  height: number | null
  byte_size: number | null
  is_locked: number
  is_trashed: number
  note: string | null
  created_at: string
  updated_at: string
}

function mapAsset(row: AssetJoinRow, tags: TagDto[]): AssetDto {
  const urls = buildAssetMediaUrls(Number(row.id))
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    storeId: Number(row.store_id),
    storeName: String(row.store_name),
    storeSlug: String(row.store_slug),
    platform: String(row.platform),
    asinOrSku: String(row.asin_or_sku),
    relativePath: String(row.relative_path),
    fileName: String(row.file_name),
    assetType: String(row.asset_type),
    versionKind: String(row.version_kind),
    md5: row.md5 == null ? null : String(row.md5),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    byteSize: row.byte_size == null ? null : Number(row.byte_size),
    isLocked: Number(row.is_locked) === 1,
    isTrashed: Number(row.is_trashed) === 1,
    note: row.note == null ? null : String(row.note),
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    previewUrl: urls.previewUrl,
    thumbUrl: urls.thumbUrl
  }
}

const SELECT_JOIN = `
  SELECT
    a.id, a.product_id, p.store_id, s.name AS store_name, s.slug AS store_slug, s.platform,
    p.asin_or_sku, a.relative_path, a.file_name, a.asset_type, a.version_kind,
    a.md5, a.width, a.height, a.byte_size, a.is_locked, a.is_trashed, a.note,
    a.created_at, a.updated_at
  FROM assets a
  INNER JOIN products p ON p.id = a.product_id
  INNER JOIN stores s ON s.id = p.store_id
`

export function findAssetByMd5(md5: string): { id: number; relativePath: string } | undefined {
  const row = queryOne<{ id: number; relative_path: string }>(
    `SELECT id, relative_path FROM assets WHERE md5 = ? AND is_trashed = 0 LIMIT 1`,
    [md5]
  )
  if (!row) return undefined
  return { id: Number(row.id), relativePath: String(row.relative_path) }
}

export function insertAsset(input: {
  productId: number
  relativePath: string
  fileName: string
  assetType: string
  versionKind?: string
  md5: string
  width: number | null
  height: number | null
  byteSize: number
  note?: string | null
}): number {
  runSql(
    `INSERT INTO assets (
      product_id, relative_path, file_name, asset_type, version_kind,
      md5, width, height, byte_size, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.productId,
      input.relativePath,
      input.fileName,
      input.assetType,
      input.versionKind ?? 'original',
      input.md5,
      input.width,
      input.height,
      input.byteSize,
      input.note ?? null
    ]
  )
  persistDatabase()
  const row = queryOne<{ id: number }>(
    `SELECT id FROM assets WHERE product_id = ? AND relative_path = ?`,
    [input.productId, input.relativePath]
  )
  if (!row) {
    throw new Error('Failed to insert asset')
  }
  return Number(row.id)
}

export function getAssetById(id: number): AssetDto | undefined {
  const row = queryOne<AssetJoinRow>(`${SELECT_JOIN} WHERE a.id = ?`, [id])
  if (!row) return undefined
  return mapAsset(row, listTagsForAsset(id))
}

export function getAssetAbsoluteMeta(id: number): {
  id: number
  relativePath: string
  md5: string | null
  isTrashed: boolean
  isLocked: boolean
} | undefined {
  const row = queryOne<{
    id: number
    relative_path: string
    md5: string | null
    is_trashed: number
    is_locked: number
  }>(`SELECT id, relative_path, md5, is_trashed, is_locked FROM assets WHERE id = ?`, [id])
  if (!row) return undefined
  return {
    id: Number(row.id),
    relativePath: String(row.relative_path),
    md5: row.md5 == null ? null : String(row.md5),
    isTrashed: Number(row.is_trashed) === 1,
    isLocked: Number(row.is_locked) === 1
  }
}

export function listAssets(query: AssetQuery = {}): AssetListResult {
  const where: string[] = []
  const params: unknown[] = []

  if (!query.includeTrashed) {
    where.push(`a.is_trashed = 0`)
  }
  if (query.storeId != null) {
    where.push(`p.store_id = ?`)
    params.push(query.storeId)
  }
  if (query.productId != null) {
    where.push(`a.product_id = ?`)
    params.push(query.productId)
  }
  if (query.assetType) {
    where.push(`a.asset_type = ?`)
    params.push(query.assetType)
  }
  if (query.tagId != null) {
    where.push(
      `EXISTS (SELECT 1 FROM asset_tags at WHERE at.asset_id = a.id AND at.tag_id = ?)`
    )
    params.push(query.tagId)
  }
  if (query.search && query.search.trim()) {
    const like = `%${query.search.trim()}%`
    where.push(
      `(p.asin_or_sku LIKE ? OR a.file_name LIKE ? OR IFNULL(a.note, '') LIKE ? OR s.name LIKE ?)`
    )
    params.push(like, like, like, like)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM assets a
     INNER JOIN products p ON p.id = a.product_id
     INNER JOIN stores s ON s.id = p.store_id
     ${whereSql}`,
    params
  )
  const total = Number(totalRow?.count ?? 0)

  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500)
  const offset = Math.max(query.offset ?? 0, 0)
  const rows = queryAll<AssetJoinRow>(
    `${SELECT_JOIN} ${whereSql}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  const items = rows.map((row) => mapAsset(row, listTagsForAsset(Number(row.id))))
  return { items, total }
}

export function updateAssetsMeta(
  ids: number[],
  patch: { assetType?: string; note?: string | null }
): number {
  let updated = 0
  for (const id of ids) {
    const current = getAssetAbsoluteMeta(id)
    if (!current || current.isLocked) continue
    if (patch.assetType != null) {
      runSql(
        `UPDATE assets SET asset_type = ?, updated_at = datetime('now') WHERE id = ?`,
        [patch.assetType, id]
      )
      updated += 1
    }
    if (patch.note !== undefined) {
      runSql(`UPDATE assets SET note = ?, updated_at = datetime('now') WHERE id = ?`, [
        patch.note,
        id
      ])
      updated += 1
    }
  }
  persistDatabase()
  return updated
}

export function trashAssets(ids: number[]): number {
  let count = 0
  for (const id of ids) {
    const current = getAssetAbsoluteMeta(id)
    if (!current || current.isLocked || current.isTrashed) continue
    runSql(
      `UPDATE assets SET is_trashed = 1, trashed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [id]
    )
    count += 1
  }
  persistDatabase()
  return count
}

export function restoreAssets(ids: number[]): number {
  let count = 0
  for (const id of ids) {
    runSql(
      `UPDATE assets SET is_trashed = 0, trashed_at = NULL, updated_at = datetime('now') WHERE id = ?`,
      [id]
    )
    count += 1
  }
  persistDatabase()
  return count
}
