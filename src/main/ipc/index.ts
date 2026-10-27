import { ipcMain } from 'electron'
import { IPC_CHANNELS, type InvokePayload } from '@shared/ipc'
import { dispatchInvoke } from './router'
import { log } from '@main/runtime/logger'

export { emitTaskProgress } from './progress'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.invoke, async (_event, payload: InvokePayload) => {
    log.debug('IPC invoke', { method: payload?.method, requestId: payload?.requestId })
    return dispatchInvoke(payload)
  })
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.invoke)
}
