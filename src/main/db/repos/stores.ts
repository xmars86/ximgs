import { queryAll, queryOne, runSql, persistDatabase } from '../client'
import type { StoreDto } from '@shared/library'

interface StoreRow {
  id: number
  name: string
  slug: string
  platform: string
  created_at: string
  updated_at: string
}

function mapStore(row: StoreRow): StoreDto {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    platform: String(row.platform),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export function listStores(): StoreDto[] {
  return queryAll<StoreRow>(
    `SELECT id, name, slug, platform, created_at, updated_at FROM stores ORDER BY name COLLATE NOCASE`
  ).map(mapStore)
}

export function getStoreById(id: number): StoreDto | undefined {
  const row = queryOne<StoreRow>(
    `SELECT id, name, slug, platform, created_at, updated_at FROM stores WHERE id = ?`,
    [id]
  )
  return row ? mapStore(row) : undefined
}

export function getStoreBySlug(slug: string): StoreDto | undefined {
  const row = queryOne<StoreRow>(
    `SELECT id, name, slug, platform, created_at, updated_at FROM stores WHERE slug = ?`,
    [slug]
  )
  return row ? mapStore(row) : undefined
}

export function createStore(input: {
  name: string
  slug: string
  platform: string
}): StoreDto {
  runSql(`INSERT INTO stores (name, slug, platform) VALUES (?, ?, ?)`, [
    input.name,
    input.slug,
    input.platform
  ])
  persistDatabase()
  const created = getStoreBySlug(input.slug)
  if (!created) {
    throw new Error('Failed to create store')
  }
  return created
}

export function updateStore(input: {
  id: number
  name?: string
  platform?: string
}): StoreDto {
  const current = getStoreById(input.id)
  if (!current) {
    throw new Error('Store not found')
  }
  runSql(
    `UPDATE stores SET name = ?, platform = ?, updated_at = datetime('now') WHERE id = ?`,
    [input.name ?? current.name, input.platform ?? current.platform, input.id]
  )
  persistDatabase()
  const updated = getStoreById(input.id)
  if (!updated) {
    throw new Error('Failed to update store')
  }
  return updated
}

export function deleteStore(id: number): boolean {
  const products = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM products WHERE store_id = ?`,
    [id]
  )
  if (Number(products?.count ?? 0) > 0) {
    throw new Error('Store still has products')
  }
  runSql(`DELETE FROM stores WHERE id = ?`, [id])
  persistDatabase()
  return true
}

export function countStores(): number {
  return Number(queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM stores`)?.count ?? 0)
}
