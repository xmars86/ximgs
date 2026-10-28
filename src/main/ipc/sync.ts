import { AppError } from '@shared/errors'
import type { IpcMethod } from '@shared/ipc'
import type { SyncConfigUpdate } from '@shared/sync'
import * as sync from '@main/domain/sync/service'

type Handler = (data: unknown) => unknown | Promise<unknown>

function asObject(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  if (typeof data !== 'object') {
    throw new AppError('INVALID_REQUEST', '请求参数无效')
  }
  return data as Record<string, unknown>
}

export function handleSync(): Partial<Record<IpcMethod, Handler>> {
  return {
    'sync.getConfig': () => sync.getPublicConfig(),
    'sync.setConfig': (data) => sync.setConfig(asObject(data) as unknown as SyncConfigUpdate),
    'sync.chooseWatchFolder': () => sync.chooseWatchFolder(),
    'sync.getStatus': () => sync.getStatus(),
    'sync.start': () => sync.start(),
    'sync.stop': () => sync.stop(),
    'sync.cancel': () => sync.cancel(),
    'sync.runNow': () => sync.runNow(),
    'sync.listFiles': (data) => {
      const obj = asObject(data)
      return sync.listFiles({
        limit: obj.limit == null ? undefined : Number(obj.limit),
        offset: obj.offset == null ? undefined : Number(obj.offset),
        search: typeof obj.search === 'string' ? obj.search : undefined,
        status: typeof obj.status === 'string' ? obj.status : undefined,
        pathPrefix: typeof obj.pathPrefix === 'string' ? obj.pathPrefix : undefined,
        directOnly: obj.directOnly === true
      })
    },
    'sync.browseFiles': (data) => {
      const obj = asObject(data)
      return sync.browseFiles({
        limit: obj.limit == null ? undefined : Number(obj.limit),
        offset: obj.offset == null ? undefined : Number(obj.offset),
        search: typeof obj.search === 'string' ? obj.search : undefined,
        status: typeof obj.status === 'string' ? obj.status : undefined,
        pathPrefix: typeof obj.pathPrefix === 'string' ? obj.pathPrefix : undefined
      })
    },
    'sync.getDailyUploadStats': (data) => {
      const obj = asObject(data)
      const days = obj.days == null ? 7 : Number(obj.days)
      return sync.getDailyUploadStats(days)
    },
    'sync.getStatusCounts': () => sync.getStatusCounts(),
    'sync.testConnection': () => sync.testConnection(),
    'sync.getChecklist': () => sync.getChecklist(),
    'sync.retryFailed': () => sync.retryFailed(),
    'sync.listRuns': (data) => {
      const obj = asObject(data)
      const limit = obj.limit == null ? 100 : Number(obj.limit)
      return sync.listRuns(limit)
    },
    'sync.uploadSingle': (data) => {
      const obj = asObject(data)
      const filePath = typeof obj.filePath === 'string' ? obj.filePath : ''
      const folderPath = typeof obj.folderPath === 'string' ? obj.folderPath : undefined
      return sync.uploadSingle(filePath, folderPath)
    },
    'sync.uploadPaths': (data) => {
      const obj = asObject(data)
      const paths = Array.isArray(obj.paths)
        ? obj.paths.filter((p): p is string => typeof p === 'string')
        : []
      const folderPath = typeof obj.folderPath === 'string' ? obj.folderPath : undefined
      return sync.uploadPaths(paths, folderPath)
    },
    'sync.uploadClipboard': (data) => {
      const obj = asObject(data)
      const folderPath = typeof obj.folderPath === 'string' ? obj.folderPath : undefined
      return sync.uploadClipboard(folderPath)
    },
    'sync.chooseImagePaths': () => sync.chooseImagePaths(),
    'sync.chooseAndUpload': (data) => {
      const obj = asObject(data)
      const folderPath = typeof obj.folderPath === 'string' ? obj.folderPath : undefined
      return sync.chooseAndUploadSingle(folderPath)
    },
    'sync.deleteFile': (data) => {
      const obj = asObject(data)
      return sync.deleteFile(Number(obj.id))
    },
    'sync.clearFiles': () => sync.clearFiles()
  }
}
