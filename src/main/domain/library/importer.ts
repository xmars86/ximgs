import { copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { clipboard, nativeImage } from 'electron'
import { AppError } from '@shared/errors'
import type { ImportClipboardInput, ImportPathsInput, ImportResult } from '@shared/library'
import { emitTaskProgress } from '@main/ipc/progress'
import { log } from '@main/runtime/logger'
import { getStoreById } from '@main/db/repos/stores'
import { ensureProduct } from '@main/db/repos/products'
import { findAssetByMd5, insertAsset } from '@main/db/repos/assets'
import {
  ensureAssetDir,
  sanitizeSegment,
  toLibraryRelative,
  uniqueFileName
} from './layout'
import { md5Buffer, md5File } from './hash'
import { isImagePath, readImageSize, readImageSizeFromBuffer } from './imageMeta'
import { ensureThumbnail, ensureThumbnailFromBuffer } from './thumbs'
import { clearImportCancel, isImportCancelled } from './importCancel'

function collectImageFiles(paths: string[]): string[] {
  const files: string[] = []
  for (const inputPath of paths) {
    let st
    try {
      st = statSync(inputPath)
    } catch {
      continue
    }
    if (st.isFile()) {
      if (isImagePath(inputPath)) files.push(inputPath)
      continue
    }
    if (st.isDirectory()) {
      walkDir(inputPath, files)
    }
  }
  return files
}

function walkDir(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walkDir(full, out)
    } else if (st.isFile() && isImagePath(full)) {
      out.push(full)
    }
  }
}

export async function importPaths(input: ImportPathsInput): Promise<ImportResult> {
  const store = getStoreById(input.storeId)
  if (!store) {
    throw new AppError('STORE_NOT_FOUND', '店铺不存在')
  }
  const asin = sanitizeSegment(input.asinOrSku, 'ASIN/SKU')
  const product = ensureProduct({ storeId: store.id, asinOrSku: asin })
  const files = collectImageFiles(input.paths)
  const result: ImportResult = {
    imported: 0,
    skippedDuplicates: 0,
    failed: 0,
    duplicateMd5s: [],
    errors: [],
    assetIds: []
  }

  const total = files.length
  if (total === 0) {
    throw new AppError('NO_IMAGES', '未找到可导入的图片文件')
  }

  clearImportCancel(input.taskId)

  for (let i = 0; i < files.length; i += 1) {
    if (isImportCancelled(input.taskId)) {
      emitTaskProgress({
        taskId: input.taskId,
        phase: 'cancelled',
        current: i,
        total,
        message: '导入已取消'
      })
      break
    }

    const filePath = files[i]!
    emitTaskProgress({
      taskId: input.taskId,
      phase: 'importing',
      current: i + 1,
      total,
      message: basename(filePath)
    })

    try {
      const md5 = await md5File(filePath)
      const dup = findAssetByMd5(md5)
      if (dup) {
        result.skippedDuplicates += 1
        result.duplicateMd5s.push(md5)
        continue
      }

      const dir = ensureAssetDir(store.slug, asin, input.assetType)
      const fileName = uniqueFileName(dir, basename(filePath))
      const dest = join(dir, fileName)
      copyFileSync(filePath, dest)

      const size = readImageSize(dest)
      const byteSize = statSync(dest).size
      const relativePath = toLibraryRelative(store.slug, asin, input.assetType, fileName)
      const assetId = insertAsset({
        productId: product.id,
        relativePath,
        fileName,
        assetType: input.assetType,
        md5,
        width: size.width,
        height: size.height,
        byteSize
      })
      try {
        ensureThumbnail(dest, md5)
      } catch (error) {
        log.warn('Thumbnail failed', { filePath: dest, error })
      }
      result.imported += 1
      result.assetIds.push(assetId)
    } catch (error) {
      result.failed += 1
      result.errors.push({
        path: filePath,
        code: error instanceof AppError ? error.code : 'IMPORT_FAILED',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  clearImportCancel(input.taskId)
  emitTaskProgress({
    taskId: input.taskId,
    phase: 'done',
    current: total,
    total,
    message: `imported=${result.imported}`
  })
  return result
}

export async function importClipboard(input: ImportClipboardInput): Promise<ImportResult> {
  const store = getStoreById(input.storeId)
  if (!store) {
    throw new AppError('STORE_NOT_FOUND', '店铺不存在')
  }
  const image = clipboard.readImage()
  if (image.isEmpty()) {
    throw new AppError('CLIPBOARD_EMPTY', '剪贴板中没有图片')
  }
  const png = image.toPNG()
  const buffer = Buffer.from(png)
  const md5 = md5Buffer(buffer)
  const result: ImportResult = {
    imported: 0,
    skippedDuplicates: 0,
    failed: 0,
    duplicateMd5s: [],
    errors: [],
    assetIds: []
  }
  const dup = findAssetByMd5(md5)
  if (dup) {
    result.skippedDuplicates = 1
    result.duplicateMd5s.push(md5)
    return result
  }

  const asin = sanitizeSegment(input.asinOrSku, 'ASIN/SKU')
  const product = ensureProduct({ storeId: store.id, asinOrSku: asin })
  const dir = ensureAssetDir(store.slug, asin, input.assetType)
  const fileName = uniqueFileName(dir, `clipboard_${Date.now()}.png`)
  const dest = join(dir, fileName)
  writeFileSync(dest, buffer)

  const size = readImageSizeFromBuffer(buffer)
  // Prefer dimensions from nativeImage if buffer decode fails later
  const niSize = nativeImage.createFromBuffer(buffer).getSize()
  const relativePath = toLibraryRelative(store.slug, asin, input.assetType, fileName)
  const assetId = insertAsset({
    productId: product.id,
    relativePath,
    fileName,
    assetType: input.assetType,
    md5,
    width: size.width ?? niSize.width ?? null,
    height: size.height ?? niSize.height ?? null,
    byteSize: buffer.byteLength
  })
  ensureThumbnailFromBuffer(buffer, md5)
  result.imported = 1
  result.assetIds.push(assetId)
  return result
}

/** Expose for tests without Electron dialog */
export const __test = { collectImageFiles, isImagePath, extname }
