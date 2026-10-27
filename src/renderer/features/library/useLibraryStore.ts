import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bridgeInvoke, onTaskProgress } from '../../shared/bridge/client'
import type { AssetDto, AssetQuery, ImportResult, StoreDto, TagDto } from '@shared/library'
import type { TaskProgressEvent } from '@shared/ipc'

export const useLibraryStore = defineStore('library', () => {
  const libraryRoot = ref<string | null>(null)
  const stores = ref<StoreDto[]>([])
  const tags = ref<TagDto[]>([])
  const assets = ref<AssetDto[]>([])
  const total = ref(0)
  const selectedIds = ref<number[]>([])
  const previewAsset = ref<AssetDto | null>(null)
  const isLoading = ref(false)
  const isImporting = ref(false)
  const importProgress = ref<TaskProgressEvent | null>(null)
  const lastImportResult = ref<ImportResult | null>(null)
  const errorMessage = ref<string | null>(null)

  const filter = ref<{
    storeId: number | null
    tagId: number | null
    assetType: string | null
    search: string
    includeTrashed: boolean
    limit: number
    offset: number
  }>({
    storeId: null,
    tagId: null,
    assetType: null,
    search: '',
    includeTrashed: false,
    limit: 200,
    offset: 0
  })

  const selectedAssets = computed(() =>
    assets.value.filter((a) => selectedIds.value.includes(a.id))
  )

  async function refreshRoot(): Promise<void> {
    const res = await bridgeInvoke('library.getRoot')
    libraryRoot.value = res.libraryRoot
  }

  async function chooseRoot(): Promise<void> {
    const res = await bridgeInvoke('library.chooseRoot')
    if (res.libraryRoot) {
      libraryRoot.value = res.libraryRoot
    }
  }

  async function refreshStores(): Promise<void> {
    stores.value = await bridgeInvoke('library.listStores')
  }

  async function refreshTags(): Promise<void> {
    tags.value = await bridgeInvoke('library.listTags')
  }

  async function refreshAssets(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null
    try {
      const query: AssetQuery = {
        search: filter.value.search.trim() || undefined,
        storeId: filter.value.storeId ?? undefined,
        tagId: filter.value.tagId ?? undefined,
        assetType: filter.value.assetType ?? undefined,
        includeTrashed: filter.value.includeTrashed,
        limit: filter.value.limit,
        offset: filter.value.offset
      }
      const res = await bridgeInvoke('library.listAssets', query)
      assets.value = res.items
      total.value = res.total
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  async function bootstrap(): Promise<void> {
    await refreshRoot()
    await Promise.all([refreshStores(), refreshTags(), refreshAssets()])
  }

  async function createStore(name: string, platform: string): Promise<void> {
    await bridgeInvoke('library.createStore', { name, platform })
    await refreshStores()
  }

  async function createTag(name: string): Promise<void> {
    await bridgeInvoke('library.createTag', { name })
    await refreshTags()
  }

  function toggleSelect(id: number): void {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((x) => x !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  function clearSelection(): void {
    selectedIds.value = []
  }

  async function trashSelected(): Promise<void> {
    if (!selectedIds.value.length) return
    await bridgeInvoke('library.trashAssets', { ids: [...selectedIds.value] })
    clearSelection()
    await refreshAssets()
  }

  async function updateSelected(patch: {
    assetType?: string
    note?: string | null
  }): Promise<void> {
    if (!selectedIds.value.length) return
    await bridgeInvoke('library.updateAssets', {
      ids: [...selectedIds.value],
      patch
    })
    await refreshAssets()
  }

  async function setTagsForSelected(tagIds: number[]): Promise<void> {
    for (const id of selectedIds.value) {
      await bridgeInvoke('library.setAssetTags', { assetId: id, tagIds })
    }
    await refreshAssets()
  }

  async function importPaths(input: {
    storeId: number
    asinOrSku: string
    assetType: string
    paths: string[]
  }): Promise<ImportResult> {
    const taskId = `import-${Date.now().toString(36)}`
    isImporting.value = true
    importProgress.value = null
    lastImportResult.value = null
    const stop = onTaskProgress((event) => {
      if (event.taskId === taskId) {
        importProgress.value = event
      }
    })
    try {
      const result = await bridgeInvoke('library.importPaths', { ...input, taskId })
      lastImportResult.value = result
      await refreshAssets()
      return result
    } finally {
      stop()
      isImporting.value = false
    }
  }

  async function importClipboard(input: {
    storeId: number
    asinOrSku: string
    assetType: string
  }): Promise<ImportResult> {
    isImporting.value = true
    try {
      const result = await bridgeInvoke('library.importClipboard', input)
      lastImportResult.value = result
      await refreshAssets()
      return result
    } finally {
      isImporting.value = false
    }
  }

  async function cancelImport(): Promise<void> {
    const taskId = importProgress.value?.taskId
    if (!taskId) return
    await bridgeInvoke('library.cancelImport', { taskId })
  }

  return {
    libraryRoot,
    stores,
    tags,
    assets,
    total,
    selectedIds,
    selectedAssets,
    previewAsset,
    isLoading,
    isImporting,
    importProgress,
    lastImportResult,
    errorMessage,
    filter,
    bootstrap,
    refreshRoot,
    chooseRoot,
    refreshStores,
    refreshTags,
    refreshAssets,
    createStore,
    createTag,
    toggleSelect,
    clearSelection,
    trashSelected,
    updateSelected,
    setTagsForSelected,
    importPaths,
    importClipboard,
    cancelImport
  }
})
