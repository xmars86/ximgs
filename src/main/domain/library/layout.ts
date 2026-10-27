import { mkdirSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { AppError } from '@shared/errors'
import { getLibraryRoot } from '@main/runtime/paths'
import {
  assetTypeFolder,
  sanitizeSegment,
  slugifyStoreName,
  toLibraryRelative
} from './segments'

export { assetTypeFolder, sanitizeSegment, slugifyStoreName, toLibraryRelative }

export function assertLibraryRoot(): string {
  const root = getLibraryRoot()
  if (!root) {
    throw new AppError('LIBRARY_ROOT_MISSING', '请先设置素材库根目录')
  }
  return root
}

/** {root}/{storeSlug}/{asin}/original/{assetType}/ */
export function ensureAssetDir(storeSlug: string, asinOrSku: string, assetType: string): string {
  const root = assertLibraryRoot()
  const slug = sanitizeSegment(storeSlug, '店铺 slug')
  const asin = sanitizeSegment(asinOrSku, 'ASIN/SKU')
  const typeFolder = assetTypeFolder(assetType)
  const dir = join(root, slug, asin, 'original', typeFolder)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function resolveLibraryAbsolute(relativePath: string): string {
  const root = assertLibraryRoot()
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.includes('..') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new AppError('INVALID_RELATIVE_PATH', '非法相对路径')
  }
  return join(root, ...normalized.split('/'))
}

export function uniqueFileName(dir: string, preferredName: string): string {
  const ext = extname(preferredName)
  const stem = basename(preferredName, ext)
  const safeStem = stem.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'image'
  const safeExt = ext.toLowerCase() || '.jpg'
  let candidate = `${safeStem}${safeExt}`
  let i = 1
  while (existsSync(join(dir, candidate))) {
    candidate = `${safeStem}_${i}${safeExt}`
    i += 1
  }
  return candidate
}
