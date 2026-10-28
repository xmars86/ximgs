/** Canonical IPC envelope types — imported by main, preload, and renderer. */

import type {
  AssetDto,
  AssetListResult,
  AssetQuery,
  CreateStoreInput,
  CreateTagInput,
  EnsureProductInput,
  ImportClipboardInput,
  ImportPathsInput,
  ImportResult,
  ProductDto,
  SetAssetTagsInput,
  StoreDto,
  TagDto,
  UpdateAssetsInput,
  UpdateStoreInput
} from './library'
import type { AppLocale } from './locale'
import type {
  BindSkuImagesInput,
  CreateSkuInput,
  SetSkuCoverInput,
  SkuDetailDto,
  SkuDto,
  SkuListResult,
  UnbindSkuImageInput,
  UpdateSkuInput
} from './sku'
import type {
  MultiUploadResult,
  SingleUploadResult,
  SyncBrowseResult,
  SyncConfigPublic,
  SyncConfigUpdate,
  SyncDailyUploadStats,
  SyncFileListResult,
  SyncFileQuery,
  SyncFileStatusCounts,
  SyncRunListResult,
  SyncRunResult,
  SyncSetupChecklist,
  SyncStatusDto
} from './sync'

export type { AppLocale } from './locale'

export interface IpcErrorPayload {
  code: string
  message: string
}

export interface IpcRequest<T = unknown> {
  requestId: string
  data?: T
}

export interface IpcResponse<T = unknown> {
  requestId: string
  ok: boolean
  data?: T
  error?: IpcErrorPayload
}

export interface TaskProgressEvent {
  taskId: string
  phase: string
  current: number
  total: number
  message?: string
}

export const IPC_CHANNELS = {
  invoke: 'ximgs:invoke',
  progress: 'task:progress'
} as const

export type IpcMethod =
  | 'system.getAppInfo'
  | 'system.getPaths'
  | 'system.ping'
  | 'system.getLocale'
  | 'system.setLocale'
  | 'system.saveTextFile'
  | 'db.getStatus'
  | 'library.getRoot'
  | 'library.setRoot'
  | 'library.chooseRoot'
  | 'library.listStores'
  | 'library.createStore'
  | 'library.updateStore'
  | 'library.deleteStore'
  | 'library.listProducts'
  | 'library.ensureProduct'
  | 'library.listAssets'
  | 'library.getAsset'
  | 'library.updateAssets'
  | 'library.trashAssets'
  | 'library.restoreAssets'
  | 'library.listTags'
  | 'library.createTag'
  | 'library.deleteTag'
  | 'library.setAssetTags'
  | 'library.chooseImportFiles'
  | 'library.chooseImportFolder'
  | 'library.importPaths'
  | 'library.importClipboard'
  | 'library.cancelImport'
  | 'sync.getConfig'
  | 'sync.setConfig'
  | 'sync.chooseWatchFolder'
  | 'sync.getStatus'
  | 'sync.start'
  | 'sync.stop'
  | 'sync.cancel'
  | 'sync.runNow'
  | 'sync.listFiles'
  | 'sync.browseFiles'
  | 'sync.getDailyUploadStats'
  | 'sync.getStatusCounts'
  | 'sync.testConnection'
  | 'sync.getChecklist'
  | 'sync.retryFailed'
  | 'sync.listRuns'
  | 'sync.uploadSingle'
  | 'sync.uploadPaths'
  | 'sync.uploadClipboard'
  | 'sync.chooseImagePaths'
  | 'sync.chooseAndUpload'
  | 'sync.deleteFile'
  | 'sync.clearFiles'
  | 'sku.list'
  | 'sku.get'
  | 'sku.create'
  | 'sku.update'
  | 'sku.delete'
  | 'sku.bindImages'
  | 'sku.unbindImage'
  | 'sku.setCover'

export interface AppInfo {
  name: string
  version: string
  electron: string
  platform: NodeJS.Platform
  isPackaged: boolean
}

export interface AppPaths {
  userData: string
  logs: string
  database: string
  config: string
  secrets: string
  libraryRoot: string | null
}

export interface DbStatus {
  path: string
  isOpen: boolean
  migrationVersion: number
}

export type IpcMethodMap = {
  'system.getAppInfo': { req: void; res: AppInfo }
  'system.getPaths': { req: void; res: AppPaths }
  'system.ping': { req: void; res: { pong: true; at: string } }
  'system.getLocale': { req: void; res: { locale: AppLocale } }
  'system.setLocale': { req: { locale: AppLocale }; res: { locale: AppLocale } }
  'system.saveTextFile': {
    req: {
      content: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }
    res: { saved: boolean; path: string | null }
  }
  'db.getStatus': { req: void; res: DbStatus }
  'library.getRoot': { req: void; res: { libraryRoot: string | null } }
  'library.setRoot': { req: { path: string }; res: { libraryRoot: string } }
  'library.chooseRoot': { req: void; res: { libraryRoot: string | null } }
  'library.listStores': { req: void; res: StoreDto[] }
  'library.createStore': { req: CreateStoreInput; res: StoreDto }
  'library.updateStore': { req: UpdateStoreInput; res: StoreDto }
  'library.deleteStore': { req: { id: number }; res: { deleted: boolean } }
  'library.listProducts': { req: { storeId: number }; res: ProductDto[] }
  'library.ensureProduct': { req: EnsureProductInput; res: ProductDto }
  'library.listAssets': { req: AssetQuery; res: AssetListResult }
  'library.getAsset': { req: { id: number }; res: AssetDto }
  'library.updateAssets': { req: UpdateAssetsInput; res: { updated: number } }
  'library.trashAssets': { req: { ids: number[] }; res: { trashed: number } }
  'library.restoreAssets': { req: { ids: number[] }; res: { restored: number } }
  'library.listTags': { req: void; res: TagDto[] }
  'library.createTag': { req: CreateTagInput; res: TagDto }
  'library.deleteTag': { req: { id: number }; res: { deleted: boolean } }
  'library.setAssetTags': { req: SetAssetTagsInput; res: { ok: true } }
  'library.chooseImportFiles': { req: void; res: { paths: string[] } }
  'library.chooseImportFolder': { req: void; res: { path: string | null } }
  'library.importPaths': { req: ImportPathsInput; res: ImportResult }
  'library.importClipboard': { req: ImportClipboardInput; res: ImportResult }
  'library.cancelImport': { req: { taskId: string }; res: { cancelled: boolean } }
  'sync.getConfig': { req: void; res: SyncConfigPublic }
  'sync.setConfig': { req: SyncConfigUpdate; res: SyncConfigPublic }
  'sync.chooseWatchFolder': { req: void; res: { watchFolder: string | null } }
  'sync.getStatus': { req: void; res: SyncStatusDto }
  'sync.start': { req: void; res: SyncStatusDto }
  'sync.stop': { req: void; res: SyncStatusDto }
  'sync.cancel': { req: void; res: SyncStatusDto }
  'sync.runNow': { req: void; res: SyncRunResult }
  'sync.listFiles': { req: SyncFileQuery | void; res: SyncFileListResult }
  'sync.browseFiles': { req: SyncFileQuery | void; res: SyncBrowseResult }
  'sync.getDailyUploadStats': { req: { days?: number } | void; res: SyncDailyUploadStats }
  'sync.getStatusCounts': { req: void; res: SyncFileStatusCounts }
  'sync.testConnection': { req: void; res: { ok: true; provider: string } }
  'sync.getChecklist': { req: void; res: SyncSetupChecklist }
  'sync.retryFailed': { req: void; res: SyncRunResult }
  'sync.listRuns': { req: { limit?: number } | void; res: SyncRunListResult }
  'sync.uploadSingle': {
    req: { filePath: string; folderPath?: string }
    res: SingleUploadResult
  }
  'sync.uploadPaths': {
    req: { paths: string[]; folderPath?: string }
    res: MultiUploadResult
  }
  'sync.uploadClipboard': {
    req: { folderPath?: string } | void
    res: SingleUploadResult
  }
  'sync.chooseImagePaths': {
    req: void
    res: string[]
  }
  'sync.chooseAndUpload': {
    req: { folderPath?: string } | void
    res: MultiUploadResult | null
  }
  'sync.deleteFile': { req: { id: number }; res: { deleted: boolean } }
  'sync.clearFiles': { req: void; res: { deleted: number; cancelled: boolean } }
  'sku.list': { req: void; res: SkuListResult }
  'sku.get': { req: { id: number }; res: SkuDetailDto }
  'sku.create': { req: CreateSkuInput; res: SkuDto }
  'sku.update': { req: UpdateSkuInput; res: SkuDto }
  'sku.delete': { req: { id: number }; res: { ok: true } }
  'sku.bindImages': { req: BindSkuImagesInput; res: SkuDetailDto }
  'sku.unbindImage': { req: UnbindSkuImageInput; res: SkuDetailDto }
  'sku.setCover': { req: SetSkuCoverInput; res: SkuDetailDto }
}

export type InvokePayload = {
  method: IpcMethod
  requestId: string
  data?: unknown
}

export type { AssetDto, AssetQuery, StoreDto, TagDto, ProductDto, ImportResult }
export type { SyncConfigPublic, SyncStatusDto, SyncFileDto, SyncRunResult } from './sync'
