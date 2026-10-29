import { readFileSync, writeFileSync } from 'node:fs'
import { BrowserWindow, dialog } from 'electron'
import { AppError } from '@shared/errors'
import {
  SKU_IMAGE_LIMIT,
  SKU_CODE_MAX_LEN,
  SKU_NAME_MAX_LEN,
  SKU_NOTE_MAX_LEN,
  SKU_CATEGORY_MAX_LEN,
  SKU_BRAND_MAX_LEN,
  SKU_BARCODE_MAX_LEN,
  SKU_IMPORT_ERROR_LIMIT,
  type BindSkuImagesInput,
  type CreateSkuInput,
  type SetSkuCoverInput,
  type SkuDetailDto,
  type SkuDto,
  type SkuImportError,
  type SkuImportResult,
  type SkuListResult,
  type UnbindSkuImageInput,
  type UnbindSkuImagesInput,
  type UpdateSkuInput,
  STANDALONE_SKU_LIMIT
} from '@shared/sku'
import * as skusRepo from '@main/db/repos/skus'
import * as skuImagesRepo from '@main/db/repos/skuImages'
import { getSyncFileById } from '@main/db/repos/syncFiles'
import { buildSkuImportTemplate, parseSkuImportCsv, type SkuImportRow } from './csv'

function normalizeSkuCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new AppError('INVALID_SKU', 'SKU 编码不能为空')
  }
  const sku = raw.trim()
  if (!sku) {
    throw new AppError('INVALID_SKU', 'SKU 编码不能为空')
  }
  if (sku.length > SKU_CODE_MAX_LEN) {
    throw new AppError('INVALID_SKU', `SKU 编码最多 ${SKU_CODE_MAX_LEN} 个字符`)
  }
  return sku
}

function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new AppError('INVALID_SKU_NAME', '名称不能为空')
  }
  const name = raw.trim()
  if (!name) {
    throw new AppError('INVALID_SKU_NAME', '名称不能为空')
  }
  if (name.length > SKU_NAME_MAX_LEN) {
    throw new AppError('INVALID_SKU_NAME', `名称最多 ${SKU_NAME_MAX_LEN} 个字符`)
  }
  return name
}

function normalizeNote(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') {
    throw new AppError('INVALID_SKU_NOTE', '备注格式无效')
  }
  const note = raw.trim()
  if (!note) return null
  if (note.length > SKU_NOTE_MAX_LEN) {
    throw new AppError('INVALID_SKU_NOTE', `备注最多 ${SKU_NOTE_MAX_LEN} 个字符`)
  }
  return note
}

function normalizeOptionalText(
  raw: unknown,
  opts: { label: string; code: string; maxLen: number }
): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') {
    throw new AppError(opts.code, `${opts.label}格式无效`)
  }
  const text = raw.trim()
  if (!text) return null
  if (text.length > opts.maxLen) {
    throw new AppError(opts.code, `${opts.label}最多 ${opts.maxLen} 个字符`)
  }
  return text
}

function normalizeCategory(raw: unknown): string | null {
  return normalizeOptionalText(raw, {
    label: '品类',
    code: 'INVALID_SKU_CATEGORY',
    maxLen: SKU_CATEGORY_MAX_LEN
  })
}

function normalizeBrand(raw: unknown): string | null {
  return normalizeOptionalText(raw, {
    label: '品牌',
    code: 'INVALID_SKU_BRAND',
    maxLen: SKU_BRAND_MAX_LEN
  })
}

function normalizeBarcode(raw: unknown): string | null {
  return normalizeOptionalText(raw, {
    label: '条码',
    code: 'INVALID_SKU_BARCODE',
    maxLen: SKU_BARCODE_MAX_LEN
  })
}

function normalizeMeasure(
  raw: unknown,
  label: string,
  opts: { max?: number } = {}
): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) {
    throw new AppError('INVALID_SKU_MEASURE', `${label}格式无效`)
  }
  if (n < 0) {
    throw new AppError('INVALID_SKU_MEASURE', `${label}不能为负数`)
  }
  const max = opts.max ?? 1_000_000
  if (n > max) {
    throw new AppError('INVALID_SKU_MEASURE', `${label}超出合理范围`)
  }
  // Keep 3 decimal places for cm / kg display stability.
  return Math.round(n * 1000) / 1000
}

function resolveAttrs(
  input: CreateSkuInput | UpdateSkuInput,
  current?: SkuDto
): {
  note: string | null
  category: string | null
  brand: string | null
  barcode: string | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
} {
  return {
    note:
      input.note !== undefined ? normalizeNote(input.note) : (current?.note ?? null),
    category:
      input.category !== undefined
        ? normalizeCategory(input.category)
        : (current?.category ?? null),
    brand:
      input.brand !== undefined
        ? normalizeBrand(input.brand)
        : (current?.brand ?? null),
    barcode:
      input.barcode !== undefined
        ? normalizeBarcode(input.barcode)
        : (current?.barcode ?? null),
    lengthCm:
      input.lengthCm !== undefined
        ? normalizeMeasure(input.lengthCm, '长度')
        : (current?.lengthCm ?? null),
    widthCm:
      input.widthCm !== undefined
        ? normalizeMeasure(input.widthCm, '宽度')
        : (current?.widthCm ?? null),
    heightCm:
      input.heightCm !== undefined
        ? normalizeMeasure(input.heightCm, '高度')
        : (current?.heightCm ?? null),
    grossWeightKg:
      input.grossWeightKg !== undefined
        ? normalizeMeasure(input.grossWeightKg, '毛重')
        : (current?.grossWeightKg ?? null),
    netWeightKg:
      input.netWeightKg !== undefined
        ? normalizeMeasure(input.netWeightKg, '净重')
        : (current?.netWeightKg ?? null)
  }
}

function requireSku(id: number): SkuDto {
  const current = skusRepo.getSkuById(Number(id))
  if (!current) {
    throw new AppError('SKU_NOT_FOUND', 'SKU 不存在')
  }
  return current
}

function buildDetail(skuId: number): SkuDetailDto {
  const sku = requireSku(skuId)
  return {
    sku,
    images: skuImagesRepo.listImagesBySku(skuId)
  }
}

export async function listSkus(): Promise<SkuListResult> {
  return {
    items: skusRepo.listSkus(),
    limit: STANDALONE_SKU_LIMIT
  }
}

export async function getSkuDetail(id: number): Promise<SkuDetailDto> {
  return buildDetail(id)
}

export function createSku(input: CreateSkuInput): SkuDto {
  const sku = normalizeSkuCode(input.sku)
  const name = normalizeName(input.name)
  const attrs = resolveAttrs(input)

  const existing = skusRepo.findSkuByCode(sku)
  if (existing) {
    throw new AppError('SKU_DUPLICATE', `SKU 已存在：${sku}`)
  }

  if (skusRepo.countSkus() >= STANDALONE_SKU_LIMIT) {
    throw new AppError(
      'SKU_LIMIT_REACHED',
      `单机版最多添加 ${STANDALONE_SKU_LIMIT} 个 SKU`
    )
  }

  return skusRepo.insertSku({ sku, name, ...attrs })
}

export function updateSku(input: UpdateSkuInput): SkuDto {
  const current = requireSku(input.id)

  const sku = input.sku !== undefined ? normalizeSkuCode(input.sku) : current.sku
  const name = input.name !== undefined ? normalizeName(input.name) : current.name
  const attrs = resolveAttrs(input, current)

  const conflict = skusRepo.findSkuByCode(sku)
  if (conflict && conflict.id !== current.id) {
    throw new AppError('SKU_DUPLICATE', `SKU 已存在：${sku}`)
  }

  return skusRepo.updateSku({ id: current.id, sku, name, ...attrs })
}

export function deleteSku(id: number): { ok: true } {
  requireSku(id)
  skusRepo.deleteSku(Number(id))
  return { ok: true }
}

export function bindImages(input: BindSkuImagesInput): SkuDetailDto {
  const sku = requireSku(input.skuId)
  const ids = Array.isArray(input.syncFileIds)
    ? [...new Set(input.syncFileIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : []
  if (!ids.length) {
    throw new AppError('INVALID_REQUEST', '请选择要绑定的图片')
  }

  const bound = new Set(skuImagesRepo.findBoundSyncFileIds(sku.id))
  const toAdd = ids.filter((id) => !bound.has(id))
  if (!toAdd.length) {
    return buildDetail(sku.id)
  }

  const currentCount = skuImagesRepo.countImagesBySku(sku.id)
  if (currentCount + toAdd.length > SKU_IMAGE_LIMIT) {
    throw new AppError(
      'SKU_IMAGE_LIMIT',
      `每个 SKU 最多绑定 ${SKU_IMAGE_LIMIT} 张图片`
    )
  }

  let hasCover = skuImagesRepo.getCoverUrl(sku.id) != null
  let sortOrder = skuImagesRepo.nextSortOrder(sku.id)

  for (const syncFileId of toAdd) {
    const file = getSyncFileById(syncFileId)
    if (!file) {
      throw new AppError('SYNC_FILE_NOT_FOUND', `图片不存在：#${syncFileId}`)
    }
    if (file.status !== 'synced' || !file.publicUrl) {
      throw new AppError(
        'SYNC_FILE_NOT_READY',
        `仅可绑定已同步且有链接的图片：${file.relativePath}`
      )
    }
    const makeCover = !hasCover
    skuImagesRepo.insertImage({
      skuId: sku.id,
      syncFileId,
      isCover: makeCover,
      sortOrder
    })
    if (makeCover) hasCover = true
    sortOrder += 1
  }

  skuImagesRepo.persist()
  return buildDetail(sku.id)
}

export function unbindImages(input: UnbindSkuImagesInput): SkuDetailDto {
  const sku = requireSku(input.skuId)
  const ids = Array.isArray(input.imageIds)
    ? [...new Set(input.imageIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : []
  if (!ids.length) {
    throw new AppError('INVALID_REQUEST', '请选择要解除绑定的图片')
  }

  const owned = new Map(
    skuImagesRepo.listImagesBySku(sku.id).map((img) => [img.id, img] as const)
  )
  let removedCover = false
  for (const imageId of ids) {
    const image = owned.get(imageId)
    if (!image) {
      throw new AppError('SKU_IMAGE_NOT_FOUND', `绑定图片不存在：#${imageId}`)
    }
    if (image.isCover) removedCover = true
    skuImagesRepo.deleteImage(image.id)
  }

  if (removedCover) {
    const nextId = skuImagesRepo.getFirstImageId(sku.id)
    if (nextId != null) {
      skuImagesRepo.clearCover(sku.id)
      skuImagesRepo.setCover(nextId)
    }
  }

  skuImagesRepo.persist()
  return buildDetail(sku.id)
}

export function unbindImage(input: UnbindSkuImageInput): SkuDetailDto {
  return unbindImages({ skuId: input.skuId, imageIds: [input.imageId] })
}

export function setCover(input: SetSkuCoverInput): SkuDetailDto {
  const sku = requireSku(input.skuId)
  const image = skuImagesRepo.getImageById(Number(input.imageId))
  if (!image) {
    throw new AppError('SKU_IMAGE_NOT_FOUND', '绑定图片不存在')
  }

  const owned = skuImagesRepo
    .listImagesBySku(sku.id)
    .some((img) => img.id === image.id)
  if (!owned) {
    throw new AppError('SKU_IMAGE_NOT_FOUND', '该图片不属于此 SKU')
  }

  skuImagesRepo.clearCover(sku.id)
  skuImagesRepo.setCover(image.id)
  skuImagesRepo.persist()
  return buildDetail(sku.id)
}

function attrsFromImportRow(cells: SkuImportRow): {
  note: string | null
  category: string | null
  brand: string | null
  barcode: string | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
} {
  // Empty cells clear optional fields on upsert.
  return {
    note: normalizeNote(cells.note || null),
    category: normalizeCategory(cells.category || null),
    brand: normalizeBrand(cells.brand || null),
    barcode: normalizeBarcode(cells.barcode || null),
    lengthCm: normalizeMeasure(cells.length_cm || null, '长度'),
    widthCm: normalizeMeasure(cells.width_cm || null, '宽度'),
    heightCm: normalizeMeasure(cells.height_cm || null, '高度'),
    grossWeightKg: normalizeMeasure(cells.gross_weight_kg || null, '毛重'),
    netWeightKg: normalizeMeasure(cells.net_weight_kg || null, '净重')
  }
}

function upsertImportRow(cells: SkuImportRow): 'created' | 'updated' {
  const sku = normalizeSkuCode(cells.sku)
  const attrs = attrsFromImportRow(cells)
  const existing = skusRepo.findSkuByCode(sku)
  if (existing) {
    const name = cells.name.trim() ? normalizeName(cells.name) : existing.name
    skusRepo.updateSku({ id: existing.id, sku, name, ...attrs })
    return 'updated'
  }
  const name = normalizeName(cells.name)
  skusRepo.insertSku({ sku, name, ...attrs })
  return 'created'
}

/** Save CSV import template via native save dialog (bytes stay in main). */
export async function downloadImportTemplate(): Promise<{
  saved: boolean
  path: string | null
}> {
  const content = buildSkuImportTemplate()
  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.SaveDialogOptions = {
    defaultPath: 'ximgs-sku-import-template.csv',
    filters: [
      { name: 'CSV', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) {
    return { saved: false, path: null }
  }
  writeFileSync(result.filePath, content, 'utf8')
  return { saved: true, path: result.filePath }
}

/**
 * Upsert SKUs from a local CSV path (main-process read only).
 * Per-row failures are collected; other rows continue.
 */
export function importFromCsv(filePath: string): SkuImportResult {
  const path = typeof filePath === 'string' ? filePath.trim() : ''
  if (!path) {
    throw new AppError('SKU_IMPORT_PATH', '请选择要导入的 CSV 文件')
  }
  if (!/\.csv$/i.test(path)) {
    throw new AppError('SKU_IMPORT_PATH', '仅支持 .csv 文件')
  }

  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new AppError('SKU_IMPORT_READ', `无法读取 CSV：${msg}`)
  }

  const { rows } = parseSkuImportCsv(text)
  if (!rows.length) {
    throw new AppError('SKU_IMPORT_EMPTY', 'CSV 中没有可导入的数据行')
  }

  const result: SkuImportResult = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: []
  }

  const pushError = (err: SkuImportError): void => {
    result.failed += 1
    if (result.errors.length < SKU_IMPORT_ERROR_LIMIT) {
      result.errors.push(err)
    }
  }

  for (const { rowNumber, cells } of rows) {
    try {
      const kind = upsertImportRow(cells)
      if (kind === 'created') result.created += 1
      else result.updated += 1
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error)
      pushError({
        row: rowNumber,
        sku: cells.sku.trim() || '—',
        message
      })
    }
  }

  return result
}
