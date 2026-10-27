import { AppError } from '@shared/errors'
import type { AssetType } from '@shared/library'

export function slugifyStoreName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base || `store-${Date.now().toString(36)}`
}

export function sanitizeSegment(value: string, label: string): string {
  const trimmed = value.trim()
  if (
    !trimmed ||
    trimmed.length > 128 ||
    trimmed.includes('..') ||
    /[\\/:*?"<>|\u0000]/.test(trimmed)
  ) {
    throw new AppError('INVALID_PATH_SEGMENT', `非法${label}: ${value}`)
  }
  return trimmed
}

export function assetTypeFolder(assetType: string): string {
  const allowed: AssetType[] = ['main', 'gallery', 'variant', 'aplus', 'ads']
  if (!allowed.includes(assetType as AssetType)) {
    throw new AppError('INVALID_ASSET_TYPE', `未知图片类型: ${assetType}`)
  }
  return assetType
}

export function toLibraryRelative(
  storeSlug: string,
  asinOrSku: string,
  assetType: string,
  fileName: string
): string {
  return [storeSlug, asinOrSku, 'original', assetType, fileName].join('/')
}

export function isImageExtension(fileName: string): boolean {
  return /\.(jpe?g|png|gif|bmp|webp)$/i.test(fileName)
}
