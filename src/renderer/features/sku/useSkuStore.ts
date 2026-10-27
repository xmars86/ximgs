import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bridgeInvoke } from '../../shared/bridge/client'
import {
  STANDALONE_SKU_LIMIT,
  type CreateSkuInput,
  type SkuDetailDto,
  type SkuDto,
  type UpdateSkuInput
} from '@shared/sku'
import type { SyncFileDto } from '@shared/sync'
import { toast } from '../../shared/ui/useToast'

export const useSkuStore = defineStore('sku', () => {
  const items = ref<SkuDto[]>([])
  const limit = ref(STANDALONE_SKU_LIMIT)
  const isBusy = ref(false)
  const errorMessage = ref<string | null>(null)

  const detail = ref<SkuDetailDto | null>(null)
  const detailOpen = ref(false)

  const pickerItems = ref<SyncFileDto[]>([])
  const pickerSearch = ref('')
  const pickerLoading = ref(false)
  const pickerSelected = ref<number[]>([])

  const count = computed(() => items.value.length)
  const atLimit = computed(() => count.value >= limit.value)
  const boundSyncFileIds = computed(
    () => new Set(detail.value?.images.map((img) => img.syncFileId) ?? [])
  )

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

  async function openDetail(id: number): Promise<void> {
    errorMessage.value = null
    try {
      detail.value = await bridgeInvoke('sku.get', { id })
      detailOpen.value = true
      pickerSelected.value = []
      pickerSearch.value = ''
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
    pickerItems.value = []
    pickerSelected.value = []
    pickerSearch.value = ''
  }

  async function loadPicker(): Promise<void> {
    pickerLoading.value = true
    try {
      const res = await bridgeInvoke('sync.listFiles', {
        limit: 200,
        offset: 0,
        status: 'synced',
        search: pickerSearch.value.trim() || undefined
      })
      pickerItems.value = res.items.filter((f) => Boolean(f.publicUrl))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.err(message)
    } finally {
      pickerLoading.value = false
    }
  }

  function togglePicker(id: number): void {
    if (boundSyncFileIds.value.has(id)) return
    const set = new Set(pickerSelected.value)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    pickerSelected.value = [...set]
  }

  async function bindSelected(): Promise<void> {
    if (!detail.value || !pickerSelected.value.length) return
    isBusy.value = true
    errorMessage.value = null
    try {
      detail.value = await bridgeInvoke('sku.bindImages', {
        skuId: detail.value.sku.id,
        syncFileIds: pickerSelected.value
      })
      pickerSelected.value = []
      await refresh()
      toast.ok('图片已绑定')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errorMessage.value = message
      toast.err(message)
    } finally {
      isBusy.value = false
    }
  }

  async function unbindImage(imageId: number): Promise<void> {
    if (!detail.value) return
    isBusy.value = true
    errorMessage.value = null
    try {
      detail.value = await bridgeInvoke('sku.unbindImage', {
        skuId: detail.value.sku.id,
        imageId
      })
      await refresh()
      toast.ok('已解除绑定')
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

  return {
    items,
    limit,
    isBusy,
    errorMessage,
    detail,
    detailOpen,
    pickerItems,
    pickerSearch,
    pickerLoading,
    pickerSelected,
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
    togglePicker,
    bindSelected,
    unbindImage,
    setCover
  }
})
