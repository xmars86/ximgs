import type { IpcMethod } from '@shared/ipc'
import * as backup from '@main/domain/backup'

type Handler = (data: unknown) => unknown | Promise<unknown>

export function handleBackup(): Partial<Record<IpcMethod, Handler>> {
  return {
    'backup.exportPackage': () => backup.exportBackupPackage(),
    'backup.importPackage': () => backup.importBackupPackage(),
    'backup.getGuide': () => backup.getBackupGuide()
  }
}
