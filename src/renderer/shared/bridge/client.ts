import type { IpcMethod, IpcMethodMap, IpcResponse } from '@shared/ipc'
import { AppError } from '@shared/errors'

function getApi() {
  if (typeof window === 'undefined' || !window.ximgs) {
    throw new AppError('BRIDGE_UNAVAILABLE', 'window.ximgs is not available (not in Electron?)')
  }
  return window.ximgs
}

export async function bridgeInvoke<M extends IpcMethod>(
  method: M,
  data?: IpcMethodMap[M]['req'] extends void ? undefined : IpcMethodMap[M]['req']
): Promise<IpcMethodMap[M]['res']> {
  const response = (await getApi().invoke(method, data)) as IpcResponse<IpcMethodMap[M]['res']>
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
