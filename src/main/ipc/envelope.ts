import type { IpcResponse } from '@shared/ipc'
import { toIpcError } from '@shared/errors'

export function okResponse<T>(requestId: string, data: T): IpcResponse<T> {
  return { requestId, ok: true, data }
}

export function errorResponse(requestId: string, error: unknown): IpcResponse {
  return { requestId, ok: false, error: toIpcError(error) }
}
