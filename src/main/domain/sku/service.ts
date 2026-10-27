import { AppError } from '@shared/errors'
import {
  STANDALONE_SKU_LIMIT,
  SKU_IMAGE_LIMIT,
  SKU_CODE_MAX_LEN,
  SKU_NAME_MAX_LEN,
  SKU_NOTE_MAX_LEN,
  type BindSkuImagesInput,
  type CreateSkuInput,
  type SetSkuCoverInput,
  type SkuDetailDto,
  type SkuDto,
  type SkuListResult,
  type UnbindSkuImageInput,
  type UpdateSkuInput
} from '@shared/sku'
import * as skusRepo from '@main/db/repos/skus'
import * as skuImagesRepo from '@main/db/repos/skuImages'
import { getSyncFileById } from '@main/db/repos/syncFiles'

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

export function listSkus(): SkuListResult {
  return {
    items: skusRepo.listSkus(),
    limit: STANDALONE_SKU_LIMIT
  }
}

export function getSkuDetail(id: number): SkuDetailDto {
  return buildDetail(id)
}

export function createSku(input: CreateSkuInput): SkuDto {
  const sku = normalizeSkuCode(input.sku)
  const name = normalizeName(input.name)
  const note = normalizeNote(input.note)

  if (skusRepo.countSkus() >= STANDALONE_SKU_LIMIT) {
    throw new AppError(
      'SKU_LIMIT_REACHED',
      `单机版最多添加 ${STANDALONE_SKU_LIMIT} 个 SKU`
    )
  }

  const existing = skusRepo.findSkuByCode(sku)
  if (existing) {
    throw new AppError('SKU_DUPLICATE', `SKU 已存在：${sku}`)
  }

  return skusRepo.insertSku({ sku, name, note })
}

export function updateSku(input: UpdateSkuInput): SkuDto {
  const current = requireSku(input.id)

  const sku = input.sku !== undefined ? normalizeSkuCode(input.sku) : current.sku
  const name = input.name !== undefined ? normalizeName(input.name) : current.name
  const note = input.note !== undefined ? normalizeNote(input.note) : current.note

  const conflict = skusRepo.findSkuByCode(sku)
  if (conflict && conflict.id !== current.id) {
    throw new AppError('SKU_DUPLICATE', `SKU 已存在：${sku}`)
  }

  return skusRepo.updateSku({ id: current.id, sku, name, note })
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

export function unbindImage(input: UnbindSkuImageInput): SkuDetailDto {
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

  const wasCover = image.isCover
  skuImagesRepo.deleteImage(image.id)

  if (wasCover) {
    const nextId = skuImagesRepo.getFirstImageId(sku.id)
    if (nextId != null) {
      skuImagesRepo.clearCover(sku.id)
      skuImagesRepo.setCover(nextId)
    }
  }

  skuImagesRepo.persist()
  return buildDetail(sku.id)
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
