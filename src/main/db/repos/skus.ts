import { queryOne, runSql, persistDatabase } from '../client'
import type { SkuDto } from '@shared/sku'
import { getCoverUrl, countImagesBySku, listSkusWithCover } from './skuImages'

interface SkuRow {
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
}

export interface SkuWriteInput {
  sku: string
  name: string
  note: string | null
  category: string | null
  brand: string | null
  barcode: string | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
}

const SKU_COLUMNS = `
  id, sku, name, note, category, brand, barcode,
  length_cm, width_cm, height_cm, gross_weight_kg, net_weight_kg,
  created_at, updated_at
`

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asNullableText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value)
  return text === '' ? null : text
}

function mapSkuBase(row: SkuRow): Omit<SkuDto, 'coverUrl' | 'imageCount'> {
  return {
    id: Number(row.id),
    sku: String(row.sku),
    name: String(row.name),
    note: asNullableText(row.note),
    category: asNullableText(row.category),
    brand: asNullableText(row.brand),
    barcode: asNullableText(row.barcode),
    lengthCm: asNullableNumber(row.length_cm),
    widthCm: asNullableNumber(row.width_cm),
    heightCm: asNullableNumber(row.height_cm),
    grossWeightKg: asNullableNumber(row.gross_weight_kg),
    netWeightKg: asNullableNumber(row.net_weight_kg),
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

function mapListRow(row: Record<string, unknown>): SkuDto {
  return {
    id: Number(row.id),
    sku: String(row.sku),
    name: String(row.name),
    note: asNullableText(row.note),
    category: asNullableText(row.category),
    brand: asNullableText(row.brand),
    barcode: asNullableText(row.barcode),
    lengthCm: asNullableNumber(row.length_cm),
    widthCm: asNullableNumber(row.width_cm),
    heightCm: asNullableNumber(row.height_cm),
    grossWeightKg: asNullableNumber(row.gross_weight_kg),
    netWeightKg: asNullableNumber(row.net_weight_kg),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    imageCount: Number(row.image_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export function listSkus(): SkuDto[] {
  return listSkusWithCover().map((row) =>
    mapListRow({
      id: row.id,
      sku: row.sku,
      name: row.name,
      note: row.note,
      category: row.category,
      brand: row.brand,
      barcode: row.barcode,
      length_cm: row.length_cm,
      width_cm: row.width_cm,
      height_cm: row.height_cm,
      gross_weight_kg: row.gross_weight_kg,
      net_weight_kg: row.net_weight_kg,
      cover_url: row.cover_url,
      image_count: row.image_count,
      created_at: row.created_at,
      updated_at: row.updated_at
    })
  )
}

export function countSkus(): number {
  return Number(queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM skus`)?.count ?? 0)
}

export function getSkuById(id: number): SkuDto | undefined {
  const row = queryOne<SkuRow>(`SELECT ${SKU_COLUMNS} FROM skus WHERE id = ?`, [id])
  return row ? enrichSku(row) : undefined
}

export function findSkuByCode(sku: string): SkuDto | undefined {
  const row = queryOne<SkuRow>(`SELECT ${SKU_COLUMNS} FROM skus WHERE sku = ?`, [sku])
  return row ? enrichSku(row) : undefined
}

export function insertSku(input: SkuWriteInput): SkuDto {
  runSql(
    `INSERT INTO skus (
      sku, name, note, category, brand, barcode,
      length_cm, width_cm, height_cm, gross_weight_kg, net_weight_kg
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sku,
      input.name,
      input.note,
      input.category,
      input.brand,
      input.barcode,
      input.lengthCm,
      input.widthCm,
      input.heightCm,
      input.grossWeightKg,
      input.netWeightKg
    ]
  )
  persistDatabase()
  const created = findSkuByCode(input.sku)
  if (!created) {
    throw new Error('Failed to create SKU')
  }
  return created
}

export function updateSku(input: SkuWriteInput & { id: number }): SkuDto {
  runSql(
    `UPDATE skus SET
      sku = ?, name = ?, note = ?, category = ?, brand = ?, barcode = ?,
      length_cm = ?, width_cm = ?, height_cm = ?, gross_weight_kg = ?, net_weight_kg = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.sku,
      input.name,
      input.note,
      input.category,
      input.brand,
      input.barcode,
      input.lengthCm,
      input.widthCm,
      input.heightCm,
      input.grossWeightKg,
      input.netWeightKg,
      input.id
    ]
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
