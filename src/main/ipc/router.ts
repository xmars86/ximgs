import { AppError } from '@shared/errors'
import type { IpcMethod, IpcMethodMap, InvokePayload } from '@shared/ipc'
import { okResponse, errorResponse } from './envelope'
import { handleSystem } from './system'
import { handleDb } from './db'
import { handleLibrary } from './library'
import { handleSync } from './sync'
import { handleSku } from './sku'
import { handleBackup } from './backup'

type Handler = (data: unknown) => unknown | Promise<unknown>

const handlers = {
  ...handleSystem(),
  ...handleDb(),
  ...handleLibrary(),
  ...handleSync(),
  ...handleSku(),
  ...handleBackup()
} as Record<IpcMethod, Handler>

export async function dispatchInvoke(payload: InvokePayload) {
  const { method, requestId, data } = payload
  if (!requestId || typeof requestId !== 'string') {
    return errorResponse('unknown', new AppError('INVALID_REQUEST', 'requestId is required'))
  }
  if (!method || !(method in handlers)) {
    return errorResponse(requestId, new AppError('UNKNOWN_METHOD', `Unknown method: ${String(method)}`))
  }
  try {
    const result = await handlers[method as IpcMethod](data)
    return okResponse(requestId, result)
  } catch (error) {
    return errorResponse(requestId, error)
  }
}

export type TypedHandlerResult<M extends IpcMethod> = IpcMethodMap[M]['res']
