import type { IpcMethod, IpcMethodMap, IpcResponse } from '@shared/ipc'
import { AppError } from '@shared/errors'

function getApi() {
  if (typeof window === 'undefined' || !window.ximgs) {
    throw new AppError('BRIDGE_UNAVAILABLE', 'window.ximgs is not available (not in Electron?)')
  }
  return window.ximgs
}

/** Strip Vue proxies so Electron structured-clone / IPC never fails. */
function toPlainIpcData<T>(data: T): T {
  if (data === undefined) return data
  return JSON.parse(JSON.stringify(data)) as T
}

export async function bridgeInvoke<M extends IpcMethod>(
  method: M,
  data?: IpcMethodMap[M]['req'] extends void ? undefined : IpcMethodMap[M]['req']
): Promise<IpcMethodMap[M]['res']> {
  const payload =
    data === undefined ? undefined : toPlainIpcData(data)
  const response = (await getApi().invoke(method, payload)) as IpcResponse<
    IpcMethodMap[M]['res']
  >
  if (!response.ok) {
    throw new AppError(
      response.error?.code ?? 'UNKNOWN_ERROR',
      response.error?.message ?? 'IPC call failed'
    )
  }
  return response.data as IpcMethodMap[M]['res']
}

export function onTaskProgress(
  listener: (event: import('@shared/ipc').TaskProgressEvent) => void
): () => void {
  return getApi().onProgress(listener)
}
