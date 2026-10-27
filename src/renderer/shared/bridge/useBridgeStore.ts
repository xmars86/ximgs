import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppInfo, AppPaths, DbStatus } from './types'
import { bridgeInvoke } from './client'

export const useBridgeStore = defineStore('bridge', () => {
  const appInfo = ref<AppInfo | null>(null)
  const paths = ref<AppPaths | null>(null)
  const dbStatus = ref<DbStatus | null>(null)
  const lastPingAt = ref<string | null>(null)

  async function refreshShellStatus(): Promise<void> {
    const [info, appPaths, db, ping] = await Promise.all([
      bridgeInvoke('system.getAppInfo'),
      bridgeInvoke('system.getPaths'),
      bridgeInvoke('db.getStatus'),
      bridgeInvoke('system.ping')
    ])
    appInfo.value = info
    paths.value = appPaths
    dbStatus.value = db
    lastPingAt.value = ping.at
  }

  return {
    appInfo,
    paths,
    dbStatus,
    lastPingAt,
    refreshShellStatus
  }
})
