/** Standalone product SKU catalog (independent of library products/stores). */

export const STANDALONE_SKU_LIMIT = 20
export const SKU_PAGE_SIZE = 10
export const SKU_IMAGE_LIMIT = 30

export const SKU_CODE_MAX_LEN = 64
export const SKU_NAME_MAX_LEN = 128
export const SKU_NOTE_MAX_LEN = 500

export interface SkuDto {
  id: number
  sku: string
  name: string
  note: string | null
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

export interface CreateSkuInput {
  sku: string
  name: string
  note?: string | null
}

export interface UpdateSkuInput {
  id: number
  sku?: string
  name?: string
  note?: string | null
}

export interface BindSkuImagesInput {
  skuId: number
  syncFileIds: number[]
}

export interface UnbindSkuImageInput {
  skuId: number
  imageId: number
}

export interface SetSkuCoverInput {
  skuId: number
  imageId: number
}

export interface SkuListResult {
  items: SkuDto[]
  limit: number
}
