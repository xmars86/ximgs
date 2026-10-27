import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bridgeInvoke, onTaskProgress } from '../../shared/bridge/client'
import type {
  SyncConfigPublic,
  SyncConfigUpdate,
  SyncDailyUploadStats,
  SyncFileDto,
  SyncRunResult,
  SyncSetupChecklist,
  SyncStatusDto
} from '@shared/sync'
import type { TaskProgressEvent } from '@shared/ipc'
import { toast } from '../../shared/ui/useToast'

export const useSyncStore = defineStore('sync', () => {
  const config = ref<SyncConfigPublic | null>(null)
  const status = ref<SyncStatusDto | null>(null)
  const checklist = ref<SyncSetupChecklist | null>(null)
  const files = ref<SyncFileDto[]>([])
  const total = ref(0)
  const isBusy = ref(false)
  const progress = ref<TaskProgressEvent | null>(null)
  const errorMessage = ref<string | null>(null)
  const testMessage = ref<string | null>(null)
  const infoMessage = ref<string | null>(null)
  const lastRunResult = ref<SyncRunResult | null>(null)
  const dailyStats = ref<SyncDailyUploadStats | null>(null)
  const draftSecret = ref('')
  const guideDismissed = ref(false)

  const showGuide = computed(() => {
    if (guideDismissed.value) return false
    if (!checklist.value) return true
    return !checklist.value.readyToSync
  })

  const failedCount = computed(
    () => status.value?.failedCount ?? files.value.filter((f) => f.status === 'error').length
  )

  async function refreshAll(): Promise<void> {
    errorMessage.value = null
    const [cfg, st, list, check, stats] = await Promise.all([
      bridgeInvoke('sync.getConfig'),
      bridgeInvoke('sync.getStatus'),
      bridgeInvoke('sync.listFiles', { limit: 500, offset: 0 }),
      bridgeInvoke('sync.getChecklist'),
      bridgeInvoke('sync.getDailyUploadStats', { days: 7 })
    ])
    config.value = cfg
    status.value = st
    files.value = list.items
    total.value = list.total
    checklist.value = check
    lastRunResult.value = st.lastResult
    dailyStats.value = stats
  }

  async function saveConfig(patch: SyncConfigUpdate): Promise<void> {
    errorMessage.value = null
    testMessage.value = null
    infoMessage.value = null
    try {
      config.value = await bridgeInvoke('sync.setConfig', patch)
      if (patch.secretAccessKey) {
        draftSecret.value = ''
      }
      checklist.value = await bridgeInvoke('sync.getChecklist')
      status.value = await bridgeInvoke('sync.getStatus')
      toast.ok('配置已保存')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      throw error
    }
  }

  async function chooseFolder(): Promise<void> {
    const res = await bridgeInvoke('sync.chooseWatchFolder')
    if (res.watchFolder && config.value) {
      config.value = { ...config.value, watchFolder: res.watchFolder }
    }
    checklist.value = await bridgeInvoke('sync.getChecklist')
    status.value = await bridgeInvoke('sync.getStatus')
  }

  async function start(): Promise<void> {
    errorMessage.value = null
    try {
      status.value = await bridgeInvoke('sync.start')
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function stop(): Promise<void> {
    status.value = await bridgeInvoke('sync.stop')
  }

  async function cancel(): Promise<void> {
    toast.info('正在取消…（当前文件传完后停止）')
    status.value = await bridgeInvoke('sync.cancel')
  }

  async function runWithProgress(method: 'sync.runNow' | 'sync.retryFailed'): Promise<void> {
    isBusy.value = true
    progress.value = null
    errorMessage.value = null
    infoMessage.value = null
    const stopListen = onTaskProgress((event) => {
      if (event.taskId.startsWith('sync-')) {
        progress.value = event
      }
    })
    try {
      lastRunResult.value = await bridgeInvoke(method)
      await refreshAll()
      if (lastRunResult.value.cancelled) {
        toast.info(
          `已取消：上传 ${lastRunResult.value.uploaded}，跳过 ${lastRunResult.value.skipped}，失败 ${lastRunResult.value.failed}`
        )
      } else if (lastRunResult.value.failed > 0) {
        toast.info(
          `同步结束：成功 ${lastRunResult.value.uploaded}，失败 ${lastRunResult.value.failed}。可点击「重试失败项」。`
        )
      } else {
        toast.ok(
          `同步完成：上传 ${lastRunResult.value.uploaded}，跳过 ${lastRunResult.value.skipped}`
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      status.value = await bridgeInvoke('sync.getStatus')
      checklist.value = await bridgeInvoke('sync.getChecklist')
    } finally {
      stopListen()
      isBusy.value = false
    }
  }

  async function runNow(): Promise<void> {
    await runWithProgress('sync.runNow')
  }

  async function retryFailed(): Promise<void> {
    await runWithProgress('sync.retryFailed')
  }

  async function clearFiles(): Promise<void> {
    errorMessage.value = null
    infoMessage.value = null
    try {
      const res = await bridgeInvoke('sync.clearFiles')
      if (res.cancelled) {
        toast.info('已取消清空')
        return
      }
      await refreshAll()
      toast.ok(
        res.deleted > 0
          ? `已清空 ${res.deleted} 条本地记录（云端对象未删除）`
          : '没有可清空的记录'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      await refreshAll().catch(() => undefined)
    }
  }

  async function testConnection(): Promise<void> {
    errorMessage.value = null
    testMessage.value = null
    try {
      const res = await bridgeInvoke('sync.testConnection')
      toast.ok(`连接成功（${res.provider}）`)
      checklist.value = await bridgeInvoke('sync.getChecklist')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      checklist.value = await bridgeInvoke('sync.getChecklist')
    }
  }

  function dismissGuide(): void {
    guideDismissed.value = true
  }

  return {
    config,
    status,
    checklist,
    files,
    total,
    isBusy,
    progress,
    errorMessage,
    testMessage,
    infoMessage,
    lastRunResult,
    dailyStats,
    draftSecret,
    showGuide,
    failedCount,
    refreshAll,
    saveConfig,
    chooseFolder,
    start,
    stop,
    cancel,
    runNow,
    retryFailed,
    clearFiles,
    testConnection,
    dismissGuide
  }
})
