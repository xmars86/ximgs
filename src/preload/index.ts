import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC_CHANNELS,
  type IpcMethod,
  type IpcMethodMap,
  type IpcResponse,
  type TaskProgressEvent
} from '@shared/ipc'

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function invoke<M extends IpcMethod>(
  method: M,
  data?: IpcMethodMap[M]['req'] extends void ? undefined : IpcMethodMap[M]['req']
): Promise<IpcResponse<IpcMethodMap[M]['res']>> {
  return ipcRenderer.invoke(IPC_CHANNELS.invoke, {
    method,
    requestId: createRequestId(),
    data
  }) as Promise<IpcResponse<IpcMethodMap[M]['res']>>
}

const api = {
  invoke,
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
  onProgress(listener: (event: TaskProgressEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: TaskProgressEvent): void => {
      listener(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.progress, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.progress, handler)
    }
  }
}

contextBridge.exposeInMainWorld('ximgs', api)

export type XimgsApi = typeof api
