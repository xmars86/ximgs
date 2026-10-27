import { queryAll, queryOne, runSql, persistDatabase } from '../client'
import type { ProductDto } from '@shared/library'

interface ProductRow {
  id: number
  store_id: number
  asin_or_sku: string
  title: string | null
  created_at: string
  updated_at: string
}

function mapProduct(row: ProductRow): ProductDto {
  return {
    id: Number(row.id),
    storeId: Number(row.store_id),
    asinOrSku: String(row.asin_or_sku),
    title: row.title == null ? null : String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export function listProductsByStore(storeId: number): ProductDto[] {
  return queryAll<ProductRow>(
    `SELECT id, store_id, asin_or_sku, title, created_at, updated_at
     FROM products WHERE store_id = ? ORDER BY asin_or_sku COLLATE NOCASE`,
    [storeId]
  ).map(mapProduct)
}

export function getProductById(id: number): ProductDto | undefined {
  const row = queryOne<ProductRow>(
    `SELECT id, store_id, asin_or_sku, title, created_at, updated_at FROM products WHERE id = ?`,
    [id]
  )
  return row ? mapProduct(row) : undefined
}

export function findProduct(storeId: number, asinOrSku: string): ProductDto | undefined {
  const row = queryOne<ProductRow>(
    `SELECT id, store_id, asin_or_sku, title, created_at, updated_at
     FROM products WHERE store_id = ? AND asin_or_sku = ?`,
    [storeId, asinOrSku]
  )
  return row ? mapProduct(row) : undefined
}

export function ensureProduct(input: {
  storeId: number
  asinOrSku: string
  title?: string | null
}): ProductDto {
  const existing = findProduct(input.storeId, input.asinOrSku)
  if (existing) {
    if (input.title != null && input.title !== existing.title) {
      runSql(
        `UPDATE products SET title = ?, updated_at = datetime('now') WHERE id = ?`,
        [input.title, existing.id]
      )
      persistDatabase()
      return getProductById(existing.id) ?? existing
    }
    return existing
  }
  runSql(`INSERT INTO products (store_id, asin_or_sku, title) VALUES (?, ?, ?)`, [
    input.storeId,
    input.asinOrSku,
    input.title ?? null
  ])
  persistDatabase()
  const created = findProduct(input.storeId, input.asinOrSku)
  if (!created) {
    throw new Error('Failed to create product')
  }
  return created
}
