import { AppError } from '@shared/errors'
import type { IpcMethod } from '@shared/ipc'
import type {
  AssetQuery,
  CreateStoreInput,
  CreateTagInput,
  EnsureProductInput,
  ImportClipboardInput,
  ImportPathsInput,
  SetAssetTagsInput,
  UpdateAssetsInput,
  UpdateStoreInput
} from '@shared/library'
import * as library from '@main/domain/library/service'

type Handler = (data: unknown) => unknown | Promise<unknown>

function asObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    throw new AppError('INVALID_REQUEST', '请求参数无效')
  }
  return data as Record<string, unknown>
}

export function handleLibrary(): Partial<Record<IpcMethod, Handler>> {
  return {
    'library.getRoot': () => library.getRoot(),
    'library.setRoot': (data) => {
      const path = String(asObject(data).path ?? '')
      return library.setRoot(path)
    },
    'library.chooseRoot': () => library.chooseRoot(),
    'library.listStores': () => library.listStores(),
    'library.createStore': (data) => library.createStore(asObject(data) as unknown as CreateStoreInput),
    'library.updateStore': (data) => library.updateStore(asObject(data) as unknown as UpdateStoreInput),
    'library.deleteStore': (data) => {
      const id = Number(asObject(data).id)
      return library.deleteStore(id)
    },
    'library.listProducts': (data) => {
      const storeId = Number(asObject(data).storeId)
      return library.listProducts(storeId)
    },
    'library.ensureProduct': (data) =>
      library.ensureProduct(asObject(data) as unknown as EnsureProductInput),
    'library.listAssets': (data) => library.listAssets((data ?? {}) as AssetQuery),
    'library.getAsset': (data) => library.getAsset(Number(asObject(data).id)),
    'library.updateAssets': (data) =>
      library.updateAssets(asObject(data) as unknown as UpdateAssetsInput),
    'library.trashAssets': (data) => {
      const ids = asObject(data).ids
      if (!Array.isArray(ids)) {
        throw new AppError('INVALID_REQUEST', 'ids 必须为数组')
      }
      return library.trashAssets(ids.map(Number))
    },
    'library.restoreAssets': (data) => {
      const ids = asObject(data).ids
      if (!Array.isArray(ids)) {
        throw new AppError('INVALID_REQUEST', 'ids 必须为数组')
      }
      return library.restoreAssets(ids.map(Number))
    },
    'library.listTags': () => library.listTags(),
    'library.createTag': (data) => library.createTag(asObject(data) as unknown as CreateTagInput),
    'library.deleteTag': (data) => library.deleteTag(Number(asObject(data).id)),
    'library.setAssetTags': (data) =>
      library.setAssetTags(asObject(data) as unknown as SetAssetTagsInput),
    'library.chooseImportFiles': () => library.chooseImportFiles(),
    'library.chooseImportFolder': () => library.chooseImportFolder(),
    'library.importPaths': (data) =>
      library.runImportPaths(asObject(data) as unknown as ImportPathsInput),
    'library.importClipboard': (data) =>
      library.runImportClipboard(asObject(data) as unknown as ImportClipboardInput),
    'library.cancelImport': (data) => library.cancelImport(String(asObject(data).taskId ?? ''))
  }
}
