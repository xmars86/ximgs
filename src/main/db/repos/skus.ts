import { queryOne, runSql, persistDatabase } from '../client'
import type { SkuDto } from '@shared/sku'
import { getCoverUrl, countImagesBySku, listSkusWithCover } from './skuImages'

interface SkuRow {
  id: number
  sku: string
  name: string
  note: string | null
  created_at: string
  updated_at: string
}

function mapSkuBase(row: SkuRow): Omit<SkuDto, 'coverUrl' | 'imageCount'> {
  return {
    id: Number(row.id),
    sku: String(row.sku),
    name: String(row.name),
    note: row.note == null ? null : String(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function enrichSku(row: SkuRow): SkuDto {
  const base = mapSkuBase(row)
  return {
    ...base,
    coverUrl: getCoverUrl(base.id),
    imageCount: countImagesBySku(base.id)
  }
}

export function listSkus(): SkuDto[] {
  return listSkusWithCover().map((row) => ({
    id: Number(row.id),
    sku: String(row.sku),
    name: String(row.name),
    note: row.note == null ? null : String(row.note),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    imageCount: Number(row.image_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }))
}

export function countSkus(): number {
  return Number(queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM skus`)?.count ?? 0)
}

export function getSkuById(id: number): SkuDto | undefined {
  const row = queryOne<SkuRow>(
    `SELECT id, sku, name, note, created_at, updated_at FROM skus WHERE id = ?`,
    [id]
  )
  return row ? enrichSku(row) : undefined
}

export function findSkuByCode(sku: string): SkuDto | undefined {
  const row = queryOne<SkuRow>(
    `SELECT id, sku, name, note, created_at, updated_at FROM skus WHERE sku = ?`,
    [sku]
  )
  return row ? enrichSku(row) : undefined
}

export function insertSku(input: {
  sku: string
  name: string
  note: string | null
}): SkuDto {
  runSql(`INSERT INTO skus (sku, name, note) VALUES (?, ?, ?)`, [
    input.sku,
    input.name,
    input.note
  ])
  persistDatabase()
  const created = findSkuByCode(input.sku)
  if (!created) {
    throw new Error('Failed to create SKU')
  }
  return created
}

export function updateSku(input: {
  id: number
  sku: string
  name: string
  note: string | null
}): SkuDto {
  runSql(
    `UPDATE skus SET sku = ?, name = ?, note = ?, updated_at = datetime('now') WHERE id = ?`,
    [input.sku, input.name, input.note, input.id]
  )
  persistDatabase()
  const updated = getSkuById(input.id)
  if (!updated) {
    throw new Error('Failed to update SKU')
  }
  return updated
}

export function deleteSku(id: number): boolean {
  runSql(`DELETE FROM skus WHERE id = ?`, [id])
  persistDatabase()
  return true
}
