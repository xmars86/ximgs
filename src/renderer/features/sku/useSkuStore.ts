import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bridgeInvoke } from '../../shared/bridge/client'
import {
  SKU_IMAGE_LIMIT,
  type CreateSkuInput,
  type SkuDetailDto,
  type SkuDto,
  type SkuImportResult,
  type UpdateSkuInput
} from '@shared/sku'
import type { SyncFileDto, SyncFolderDto } from '@shared/sync'
import { toast } from '../../shared/ui/useToast'

const PICKER_PAGE_SIZE = 96

export const useSkuStore = defineStore('sku', () => {
  const items = ref<SkuDto[]>([])
  const limit = ref<number | null>(null)
  const isBusy = ref(false)
  const errorMessage = ref<string | null>(null)

  const detail = ref<SkuDetailDto | null>(null)
  const detailOpen = ref(false)

  /** Directory-mode picker (same browse model as library tree view). */
  const pickerItems = ref<SyncFileDto[]>([])
  const pickerFolders = ref<SyncFolderDto[]>([])
  const pickerPathPrefix = ref('')
  const pickerPathHistory = ref<string[]>([])
  const pickerSearch = ref('')
  const pickerLoading = ref(false)
  const pickerSelected = ref<number[]>([])
  const pickerPage = ref(1)
  const pickerTotal = ref(0)
  /** Bound images selected for batch unbind. */
  const boundSelected = ref<number[]>([])

  const count = computed(() => items.value.length)
  const atLimit = computed(
    () => limit.value != null && count.value >= limit.value
  )
  const boundSyncFileIds = computed(
    () => new Set(detail.value?.images.map((img) => img.syncFileId) ?? [])
  )
  const pickerCanGoBack = computed(() => pickerPathHistory.value.length > 0)
  const pickerPageCount = computed(() =>
    Math.max(1, Math.ceil(pickerTotal.value / PICKER_PAGE_SIZE))
  )
  const pickerCanPrev = computed(() => pickerPage.value > 1)
  const pickerCanNext = computed(() => pickerPage.value < pickerPageCount.value)
  const pickerHasSelection = computed(() => pickerSelected.value.length > 0)

  async function refresh(): Promise<void> {
    errorMessage.value = null
    const result = await bridgeInvoke('sku.list')
    items.value = result.items
    limit.value = result.limit
  }

  async function create(input: CreateSkuInput): Promise<SkuDto> {
    isBusy.value = true
    errorMessage.value = null
    try {
      const created = await bridgeInvoke('sku.create', input)
      await refresh()
      toast.ok('SKU 已添加')
      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function update(input: UpdateSkuInput): Promise<SkuDto> {
    isBusy.value = true
    errorMessage.value = null
    try {
      const updated = await bridgeInvoke('sku.update', input)
      await refresh()
      if (detail.value?.sku.id === updated.id) {
        detail.value = await bridgeInvoke('sku.get', { id: updated.id })
      }
      toast.ok('SKU 已更新')
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function remove(id: number): Promise<void> {
    isBusy.value = true
    errorMessage.value = null
    try {
      await bridgeInvoke('sku.delete', { id })
      if (detail.value?.sku.id === id) {
        closeDetail()
      }
      await refresh()
      toast.ok('SKU 已删除')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      throw error
    } finally {
      isBusy.value = false
    }
  }

  function clearPickerSelection(): void {
    pickerSelected.value = []
  }

  function resetPickerNav(): void {
    pickerPathPrefix.value = ''
    pickerPathHistory.value = []
    pickerSearch.value = ''
    pickerPage.value = 1
    clearPickerSelection()
    pickerItems.value = []
    pickerFolders.value = []
    pickerTotal.value = 0
    boundSelected.value = []
  }

  function toggleBoundSelected(imageId: number): void {
    const set = new Set(boundSelected.value)
    if (set.has(imageId)) set.delete(imageId)
    else set.add(imageId)
    boundSelected.value = [...set]
  }

  function clearBoundSelected(): void {
    boundSelected.value = []
  }

  async function openDetail(id: number): Promise<void> {
    errorMessage.value = null
    try {
      detail.value = await bridgeInvoke('sku.get', { id })
      detailOpen.value = true
      resetPickerNav()
      await loadPicker()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
    }
  }

  function closeDetail(): void {
    detailOpen.value = false
    detail.value = null
    resetPickerNav()
  }

  async function loadPicker(): Promise<void> {
    pickerLoading.value = true
    try {
      const offset = (pickerPage.value - 1) * PICKER_PAGE_SIZE
      const res = await bridgeInvoke('sync.browseFiles', {
        limit: PICKER_PAGE_SIZE,
        offset,
        status: 'synced',
        search: pickerSearch.value.trim() || undefined,
        pathPrefix: pickerPathPrefix.value || undefined
      })
      pickerPathPrefix.value = res.pathPrefix
      pickerFolders.value = res.folders
      pickerItems.value = res.items.filter((f) => Boolean(f.publicUrl))
      pickerTotal.value = res.total
      const maxPage = Math.max(1, Math.ceil(pickerTotal.value / PICKER_PAGE_SIZE) || 1)
      if (pickerPage.value > maxPage) {
        pickerPage.value = maxPage
        if (pickerTotal.value > 0 && pickerItems.value.length === 0) {
          await loadPicker()
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.err(message)
    } finally {
      pickerLoading.value = false
    }
  }

  async function openPickerFolder(path: string, pushHistory = true): Promise<void> {
    const next = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (pushHistory && pickerPathPrefix.value !== next) {
      pickerPathHistory.value = [...pickerPathHistory.value, pickerPathPrefix.value]
    }
    pickerPathPrefix.value = next
    pickerPage.value = 1
    await loadPicker()
  }

  async function pickerGoBack(): Promise<void> {
    const prev = pickerPathHistory.value[pickerPathHistory.value.length - 1]
    if (prev === undefined) return
    pickerPathHistory.value = pickerPathHistory.value.slice(0, -1)
    await openPickerFolder(prev, false)
  }

  async function pickerGoUp(): Promise<void> {
    if (!pickerPathPrefix.value) return
    const parts = pickerPathPrefix.value.split('/').filter(Boolean)
    parts.pop()
    await openPickerFolder(parts.join('/'), true)
  }

  async function pickerPrevPage(): Promise<void> {
    if (!pickerCanPrev.value) return
    pickerPage.value -= 1
    await loadPicker()
  }

  async function pickerNextPage(): Promise<void> {
    if (!pickerCanNext.value) return
    pickerPage.value += 1
    await loadPicker()
  }

  function togglePicker(id: number): void {
    if (boundSyncFileIds.value.has(id)) return
    const set = new Set(pickerSelected.value)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    pickerSelected.value = [...set]
  }

  /** Select or deselect a batch of sync-file ids (current folder / page). */
  function setPickerSelection(ids: number[], selected: boolean): void {
    const set = new Set(pickerSelected.value)
    for (const id of ids) {
      if (!Number.isFinite(id) || id <= 0) continue
      if (boundSyncFileIds.value.has(id)) continue
      if (selected) set.add(id)
      else set.delete(id)
    }
    pickerSelected.value = [...set]
  }

  async function bindSelected(): Promise<void> {
    if (!detail.value || !pickerSelected.value.length) return
    isBusy.value = true
    errorMessage.value = null
    try {
      const bound = boundSyncFileIds.value
      let syncFileIds = pickerSelected.value
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0 && !bound.has(id))
      if (!syncFileIds.length) {
        toast.info('没有可绑定的新图')
        return
      }
      const remaining = SKU_IMAGE_LIMIT - detail.value.images.length
      if (remaining <= 0) {
        toast.err(`每个 SKU 最多绑定 ${SKU_IMAGE_LIMIT} 张图片`)
        return
      }
      if (syncFileIds.length > remaining) {
        syncFileIds = syncFileIds.slice(0, remaining)
        toast.info(`已超过剩余名额，将绑定前 ${remaining} 张`)
      }
      detail.value = await bridgeInvoke('sku.bindImages', {
        skuId: Number(detail.value.sku.id),
        syncFileIds
      })
      clearPickerSelection()
      await refresh()
      await loadPicker()
      toast.ok(`已绑定 ${syncFileIds.length} 张图片`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
    } finally {
      isBusy.value = false
    }
  }

  async function unbindImage(imageId: number): Promise<void> {
    await unbindSelected([imageId])
  }

  async function unbindSelected(imageIds?: number[]): Promise<void> {
    if (!detail.value) return
    const ids = (imageIds ?? boundSelected.value)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
    if (!ids.length) return
    isBusy.value = true
    errorMessage.value = null
    try {
      detail.value = await bridgeInvoke('sku.unbindImages', {
        skuId: detail.value.sku.id,
        imageIds: ids
      })
      boundSelected.value = []
      await refresh()
      toast.ok(ids.length > 1 ? `已解除 ${ids.length} 张绑定` : '已解除绑定')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
    } finally {
      isBusy.value = false
    }
  }

  async function setCover(imageId: number): Promise<void> {
    if (!detail.value) return
    isBusy.value = true
    errorMessage.value = null
    try {
      detail.value = await bridgeInvoke('sku.setCover', {
        skuId: detail.value.sku.id,
        imageId
      })
      await refresh()
      toast.ok('封面已更新')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
    } finally {
      isBusy.value = false
    }
  }

  async function downloadImportTemplate(): Promise<boolean> {
    isBusy.value = true
    errorMessage.value = null
    try {
      const res = await bridgeInvoke('sku.downloadImportTemplate')
      return res.saved
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      return false
    } finally {
      isBusy.value = false
    }
  }

  async function importCsv(filePath: string): Promise<SkuImportResult | null> {
    isBusy.value = true
    errorMessage.value = null
    try {
      const res = await bridgeInvoke('sku.importCsv', { filePath })
      await refresh()
      return res
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
      await refresh().catch(() => undefined)
      return null
    } finally {
      isBusy.value = false
    }
  }

  return {
    items,
    limit,
    isBusy,
    errorMessage,
    detail,
    detailOpen,
    pickerItems,
    pickerFolders,
    pickerPathPrefix,
    pickerPathHistory,
    pickerSearch,
    pickerLoading,
    pickerSelected,
    pickerPage,
    pickerTotal,
    pickerCanGoBack,
    pickerPageCount,
    pickerCanPrev,
    pickerCanNext,
    pickerHasSelection,
    boundSelected,
    count,
    atLimit,
    boundSyncFileIds,
    refresh,
    create,
    update,
    remove,
    openDetail,
    closeDetail,
    loadPicker,
    openPickerFolder,
    pickerGoBack,
    pickerGoUp,
    pickerPrevPage,
    pickerNextPage,
    togglePicker,
    setPickerSelection,
    clearPickerSelection,
    toggleBoundSelected,
    clearBoundSelected,
    bindSelected,
    unbindImage,
    unbindSelected,
    setCover,
    downloadImportTemplate,
    importCsv
  }
})
