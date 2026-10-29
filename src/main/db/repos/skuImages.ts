import { queryAll, queryOne, runSql, persistDatabase } from '../client'
import type { SkuImageDto } from '@shared/sku'

interface SkuImageRow {
  id: number
  sync_file_id: number
  relative_path: string
  public_url: string
  is_cover: number
  sort_order: number
}

function mapImage(row: SkuImageRow): SkuImageDto {
  return {
    id: Number(row.id),
    syncFileId: Number(row.sync_file_id),
    relativePath: String(row.relative_path),
    publicUrl: String(row.public_url),
    isCover: Number(row.is_cover) === 1,
    sortOrder: Number(row.sort_order)
  }
}

const IMAGE_SELECT = `
  SELECT si.id, si.sync_file_id, sf.relative_path, sf.public_url, si.is_cover, si.sort_order
  FROM sku_images si
  INNER JOIN sync_files sf ON sf.id = si.sync_file_id AND IFNULL(sf.is_trashed, 0) = 0
`

export function listImagesBySku(skuId: number): SkuImageDto[] {
  return queryAll<SkuImageRow>(
    `${IMAGE_SELECT}
     WHERE si.sku_id = ?
     ORDER BY si.is_cover DESC, si.sort_order ASC, si.id ASC`,
    [skuId]
  ).map(mapImage)
}

export function countImagesBySku(skuId: number): number {
  return Number(
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM sku_images si
       INNER JOIN sync_files sf ON sf.id = si.sync_file_id AND IFNULL(sf.is_trashed, 0) = 0
       WHERE si.sku_id = ?`,
      [skuId]
    )?.count ?? 0
  )
}

export function getImageById(id: number): SkuImageDto | undefined {
  const row = queryOne<SkuImageRow>(`${IMAGE_SELECT} WHERE si.id = ?`, [id])
  return row ? mapImage(row) : undefined
}

export function findBoundSyncFileIds(skuId: number): number[] {
  return queryAll<{ sync_file_id: number }>(
    `SELECT sync_file_id FROM sku_images WHERE sku_id = ?`,
    [skuId]
  ).map((r) => Number(r.sync_file_id))
}

export function getCoverUrl(skuId: number): string | null {
  const row = queryOne<{ public_url: string | null }>(
    `SELECT sf.public_url
     FROM sku_images si
     INNER JOIN sync_files sf ON sf.id = si.sync_file_id AND IFNULL(sf.is_trashed, 0) = 0
     WHERE si.sku_id = ? AND si.is_cover = 1
     LIMIT 1`,
    [skuId]
  )
  return row?.public_url == null ? null : String(row.public_url)
}

export function nextSortOrder(skuId: number): number {
  const row = queryOne<{ max_order: number | null }>(
    `SELECT MAX(sort_order) AS max_order FROM sku_images WHERE sku_id = ?`,
    [skuId]
  )
  return Number(row?.max_order ?? -1) + 1
}

export function insertImage(input: {
  skuId: number
  syncFileId: number
  isCover: boolean
  sortOrder: number
}): number {
  runSql(
    `INSERT INTO sku_images (sku_id, sync_file_id, is_cover, sort_order) VALUES (?, ?, ?, ?)`,
    [input.skuId, input.syncFileId, input.isCover ? 1 : 0, input.sortOrder]
  )
  const row = queryOne<{ id: number }>(`SELECT last_insert_rowid() AS id`)
  return Number(row?.id ?? 0)
}

export function deleteImage(id: number): void {
  runSql(`DELETE FROM sku_images WHERE id = ?`, [id])
}

export function clearCover(skuId: number): void {
  runSql(`UPDATE sku_images SET is_cover = 0 WHERE sku_id = ?`, [skuId])
}

export function setCover(imageId: number): void {
  runSql(`UPDATE sku_images SET is_cover = 1 WHERE id = ?`, [imageId])
}

export function getFirstImageId(skuId: number): number | undefined {
  const row = queryOne<{ id: number }>(
    `SELECT id FROM sku_images WHERE sku_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`,
    [skuId]
  )
  return row ? Number(row.id) : undefined
}

export function persist(): void {
  persistDatabase()
}

export interface SkuListRow {
  id: number
  sku: string
  name: string
  note: string | null
  category: string | null
  brand: string | null
  barcode: string | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  gross_weight_kg: number | null
  net_weight_kg: number | null
  created_at: string
  updated_at: string
  cover_url: string | null
  image_count: number
}

export function listSkusWithCover(): SkuListRow[] {
  return queryAll<SkuListRow>(
    `SELECT
       s.id, s.sku, s.name, s.note, s.category, s.brand, s.barcode,
       s.length_cm, s.width_cm, s.height_cm, s.gross_weight_kg, s.net_weight_kg,
       s.created_at, s.updated_at,
       (
         SELECT sf.public_url
         FROM sku_images si
         INNER JOIN sync_files sf ON sf.id = si.sync_file_id AND IFNULL(sf.is_trashed, 0) = 0
         WHERE si.sku_id = s.id AND si.is_cover = 1
         LIMIT 1
       ) AS cover_url,
       (
         SELECT COUNT(*)
         FROM sku_images si2
         INNER JOIN sync_files sf2 ON sf2.id = si2.sync_file_id AND IFNULL(sf2.is_trashed, 0) = 0
         WHERE si2.sku_id = s.id
       ) AS image_count
     FROM skus s
     ORDER BY s.sku COLLATE NOCASE`
  )
}
