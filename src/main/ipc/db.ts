import type { IpcMethod } from '@shared/ipc'
import { getDbStatus } from '@main/db/client'

type Handler = (data: unknown) => unknown

export function handleDb(): Partial<Record<IpcMethod, Handler>> {
  return {
    'db.getStatus': () => getDbStatus()
  }
}
