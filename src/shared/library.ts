export const STORE_PLATFORMS = [
  'amazon',
  'shopify',
  'temu',
  'independent',
  'walmart',
  'ebay',
  'other'
] as const

export type StorePlatform = (typeof STORE_PLATFORMS)[number]

export const ASSET_TYPES = ['main', 'gallery', 'variant', 'aplus', 'ads'] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export const VERSION_KINDS = ['original', 'processed', 'listing'] as const
export type VersionKind = (typeof VERSION_KINDS)[number]

export interface StoreDto {
  id: number
  name: string
  slug: string
  platform: StorePlatform | string
  createdAt: string
  updatedAt: string
}

export interface ProductDto {
  id: number
  storeId: number
  asinOrSku: string
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface TagDto {
  id: number
  name: string
  color: string | null
  createdAt: string
}

export interface AssetDto {
  id: number
  productId: number
  storeId: number
  storeName: string
  storeSlug: string
  platform: string
  asinOrSku: string
  relativePath: string
  fileName: string
  assetType: AssetType | string
  versionKind: VersionKind | string
  md5: string | null
  width: number | null
  height: number | null
  byteSize: number | null
  isLocked: boolean
  isTrashed: boolean
  note: string | null
  tags: TagDto[]
  createdAt: string
  updatedAt: string
  /** Custom protocol URL for preview (full or thumb). */
  previewUrl: string
  thumbUrl: string
}

export interface AssetQuery {
  storeId?: number
  productId?: number
  assetType?: AssetType | string
  tagId?: number
  search?: string
  includeTrashed?: boolean
  limit?: number
  offset?: number
}

export interface AssetListResult {
  items: AssetDto[]
  total: number
}

export interface CreateStoreInput {
  name: string
  slug?: string
  platform: StorePlatform | string
}

export interface UpdateStoreInput {
  id: number
  name?: string
  platform?: StorePlatform | string
}

export interface EnsureProductInput {
  storeId: number
  asinOrSku: string
  title?: string | null
}

export interface ImportPathsInput {
  storeId: number
  asinOrSku: string
  assetType: AssetType | string
  paths: string[]
  taskId: string
}

export interface ImportClipboardInput {
  storeId: number
  asinOrSku: string
  assetType: AssetType | string
}

export interface ImportResult {
  imported: number
  skippedDuplicates: number
  failed: number
  duplicateMd5s: string[]
  errors: Array<{ path: string; code: string; message: string }>
  assetIds: number[]
}

export interface UpdateAssetsInput {
  ids: number[]
  patch: {
    assetType?: AssetType | string
    note?: string | null
    asinOrSku?: string
    storeId?: number
  }
}

export interface SetAssetTagsInput {
  assetId: number
  tagIds: number[]
}

export interface CreateTagInput {
  name: string
  color?: string | null
}

export const DEFAULT_TAG_NAMES = [
  '白底图',
  '场景图',
  '开箱图',
  '已上架',
  '待处理',
  '已锁定'
] as const
