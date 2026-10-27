import { AppError } from '@shared/errors'
import type { IpcMethod } from '@shared/ipc'
import type {
  BindSkuImagesInput,
  CreateSkuInput,
  SetSkuCoverInput,
  UnbindSkuImageInput,
  UpdateSkuInput
} from '@shared/sku'
import * as sku from '@main/domain/sku/service'

type Handler = (data: unknown) => unknown | Promise<unknown>

function asObject(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  if (typeof data !== 'object') {
    throw new AppError('INVALID_REQUEST', '请求参数无效')
  }
  return data as Record<string, unknown>
}

function requirePositiveId(value: unknown, label: string): number {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('INVALID_REQUEST', `无效的 ${label}`)
  }
  return id
}

export function handleSku(): Partial<Record<IpcMethod, Handler>> {
  return {
    'sku.list': () => sku.listSkus(),
    'sku.get': (data) => sku.getSkuDetail(requirePositiveId(asObject(data).id, 'SKU ID')),
    'sku.create': (data) => sku.createSku(asObject(data) as unknown as CreateSkuInput),
    'sku.update': (data) => sku.updateSku(asObject(data) as unknown as UpdateSkuInput),
    'sku.delete': (data) => sku.deleteSku(requirePositiveId(asObject(data).id, 'SKU ID')),
    'sku.bindImages': (data) => {
      const obj = asObject(data)
      return sku.bindImages({
        skuId: requirePositiveId(obj.skuId, 'SKU ID'),
        syncFileIds: Array.isArray(obj.syncFileIds)
          ? obj.syncFileIds.map(Number)
          : []
      } as BindSkuImagesInput)
    },
    'sku.unbindImage': (data) => {
      const obj = asObject(data)
      return sku.unbindImage({
        skuId: requirePositiveId(obj.skuId, 'SKU ID'),
        imageId: requirePositiveId(obj.imageId, '图片 ID')
      } as UnbindSkuImageInput)
    },
    'sku.setCover': (data) => {
      const obj = asObject(data)
      return sku.setCover({
        skuId: requirePositiveId(obj.skuId, 'SKU ID'),
        imageId: requirePositiveId(obj.imageId, '图片 ID')
      } as SetSkuCoverInput)
    }
  }
}
