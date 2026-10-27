import { BrowserWindow } from 'electron'
import { IPC_CHANNELS, type TaskProgressEvent } from '@shared/ipc'

export function emitTaskProgress(event: TaskProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.progress, event)
  }
}
