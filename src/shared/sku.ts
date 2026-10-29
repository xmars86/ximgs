/** Standalone product SKU catalog (independent of library products/stores). */

export const STANDALONE_SKU_LIMIT = 100
export const SKU_PAGE_SIZE = 10
export const SKU_IMAGE_LIMIT = 30

export const SKU_CODE_MAX_LEN = 64
export const SKU_NAME_MAX_LEN = 128
export const SKU_NOTE_MAX_LEN = 500
export const SKU_CATEGORY_MAX_LEN = 64
export const SKU_BRAND_MAX_LEN = 64
export const SKU_BARCODE_MAX_LEN = 64

export interface SkuDto {
  id: number
  sku: string
  name: string
  note: string | null
  /** Product category / product type label. */
  category: string | null
  /** Brand name. */
  brand: string | null
  /** Barcode / UPC / EAN / GTIN. */
  barcode: string | null
  /** Outer length in centimeters. */
  lengthCm: number | null
  /** Outer width in centimeters. */
  widthCm: number | null
  /** Outer height in centimeters. */
  heightCm: number | null
  /** Gross weight in kilograms. */
  grossWeightKg: number | null
  /** Net weight in kilograms. */
  netWeightKg: number | null
  coverUrl: string | null
  imageCount: number
  createdAt: string
  updatedAt: string
}

export interface SkuImageDto {
  id: number
  syncFileId: number
  relativePath: string
  publicUrl: string
  isCover: boolean
  sortOrder: number
}

export interface SkuDetailDto {
  sku: SkuDto
  images: SkuImageDto[]
}

export interface SkuAttrsInput {
  note?: string | null
  category?: string | null
  brand?: string | null
  barcode?: string | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  grossWeightKg?: number | null
  netWeightKg?: number | null
}

export interface CreateSkuInput extends SkuAttrsInput {
  sku: string
  name: string
}

export interface UpdateSkuInput extends SkuAttrsInput {
  id: number
  sku?: string
  name?: string
}

export interface BindSkuImagesInput {
  skuId: number
  syncFileIds: number[]
}

export interface UnbindSkuImageInput {
  skuId: number
  imageId: number
}

export interface UnbindSkuImagesInput {
  skuId: number
  imageIds: number[]
}

export interface SetSkuCoverInput {
  skuId: number
  imageId: number
}

export interface SkuListResult {
  items: SkuDto[]
  /** Max SKUs; `null` = unlimited (team edition Host). */
  limit: number | null
}

/** Max data rows accepted in one CSV import (excluding header). */
export const SKU_IMPORT_MAX_ROWS = 5000

/** Max per-row error details returned over IPC. */
export const SKU_IMPORT_ERROR_LIMIT = 50

export interface SkuImportError {
  row: number
  sku: string
  message: string
}

export interface SkuImportResult {
  created: number
  updated: number
  failed: number
  errors: SkuImportError[]
}

/** Fixed English CSV headers for import template / parser. */
export const SKU_IMPORT_HEADERS = [
  'sku',
  'name',
  'category',
  'brand',
  'barcode',
  'length_cm',
  'width_cm',
  'height_cm',
  'gross_weight_kg',
  'net_weight_kg',
  'note'
] as const

export type SkuImportHeader = (typeof SKU_IMPORT_HEADERS)[number]
