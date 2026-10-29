import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bridgeInvoke } from '../../shared/bridge/client'
import type { MultiUploadResult, SingleUploadResult, SyncFileDto, SyncFolderDto } from '@shared/sync'
import { toast } from '../../shared/ui/useToast'

export const PAGE_SIZE_OPTIONS = [24, 48, 96] as const
export type GalleryPageSize = (typeof PAGE_SIZE_OPTIONS)[number]

export const useGalleryStore = defineStore('gallery', () => {
  const items = ref<SyncFileDto[]>([])
  const folders = ref<SyncFolderDto[]>([])
  const total = ref(0)
  const search = ref('')
  const statusFilter = ref('')
  const pathPrefix = ref('')
  /**
   * flat = table/grid (paginated file list, no folder rows)
   * folder = directory explorer (browse children of pathPrefix)
   */
  const listingMode = ref<'flat' | 'folder'>('flat')
  /** library = normal gallery; trash = recycle bin. */
  const scope = ref<'library' | 'trash'>('library')
  const trashCount = ref(0)
  /** Target folder drafted in the upload dialog; empty = auto `images/yyyy/mm`. */
  const uploadFolder = ref('')
  const showUploadDialog = ref(false)
  const page = ref(1)
  const pageSize = ref<GalleryPageSize>(24)
  const isLoading = ref(false)
  const isUploading = ref(false)
  const uploadProgress = ref('')
  const errorMessage = ref<string | null>(null)
  const infoMessage = ref<string | null>(null)
  const preview = ref<SyncFileDto | null>(null)
  const lastUpload = ref<SingleUploadResult | MultiUploadResult | null>(null)

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const canPrev = computed(() => page.value > 1)
  const canNext = computed(() => page.value < pageCount.value)
  const rangeLabel = computed(() => {
    if (total.value === 0) return { from: 0, to: 0 }
    const from = (page.value - 1) * pageSize.value + 1
    const to = Math.min(page.value * pageSize.value, total.value)
    return { from, to }
  })

  const breadcrumbs = computed(() => {
    const parts = pathPrefix.value ? pathPrefix.value.split('/').filter(Boolean) : []
    const crumbs: { label: string; path: string }[] = [{ label: '全部', path: '' }]
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      crumbs.push({ label: part, path: acc })
    }
    return crumbs
  })

  const isSearching = computed(() => Boolean(search.value.trim()))
  const isEmpty = computed(
    () => !isLoading.value && folders.value.length === 0 && items.value.length === 0
  )

  async function refreshTrashCount(): Promise<void> {
    try {
      const res = await bridgeInvoke('sync.getTrashCount')
      trashCount.value = res.count
    } catch {
      trashCount.value = 0
    }
  }

  async function refresh(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null
    try {
      const offset = (page.value - 1) * pageSize.value
      const status = statusFilter.value || undefined
      const searchQ = search.value.trim() || undefined
      const trashOnly = scope.value === 'trash'
      // Recycle bin always uses directory (folder) browse, same as library tree mode.
      const useFolderBrowse = trashOnly || listingMode.value === 'folder'

      if (!useFolderBrowse) {
        const res = await bridgeInvoke('sync.listFiles', {
          limit: pageSize.value,
          offset,
          search: searchQ,
          status
        })
        folders.value = []
        items.value = res.items
        total.value = res.total
      } else {
        const res = await bridgeInvoke('sync.browseFiles', {
          limit: pageSize.value,
          offset,
          search: searchQ,
          status: trashOnly ? undefined : status,
          pathPrefix: pathPrefix.value || undefined,
          trashOnly
        })
        pathPrefix.value = res.pathPrefix
        folders.value = res.folders
        items.value = res.items
        total.value = res.total
      }

      await refreshTrashCount()

      const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
      if (page.value > maxPage) {
        page.value = maxPage
        if (total.value > 0 && items.value.length === 0) {
          await refresh()
        }
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  async function openTrash(): Promise<void> {
    scope.value = 'trash'
    listingMode.value = 'folder'
    page.value = 1
    pathPrefix.value = ''
    statusFilter.value = ''
    await refresh()
  }

  async function closeTrash(): Promise<void> {
    scope.value = 'library'
    page.value = 1
    pathPrefix.value = ''
    await refresh()
  }

  async function setListingMode(mode: 'flat' | 'folder'): Promise<void> {
    if (listingMode.value === mode) return
    listingMode.value = mode
    page.value = 1
    if (mode === 'flat') {
      pathPrefix.value = ''
    }
    await refresh()
  }

  async function goToPage(next: number): Promise<void> {
    const target = Math.floor(next)
    if (!Number.isFinite(target) || target < 1) return
    if (target === page.value) return
    page.value = Math.max(1, target)
    await refresh()
  }

  async function prevPage(): Promise<void> {
    if (!canPrev.value) return
    await goToPage(page.value - 1)
  }

  async function nextPage(): Promise<void> {
    if (!canNext.value) return
    await goToPage(page.value + 1)
  }

  async function setPageSize(size: GalleryPageSize): Promise<void> {
    if (pageSize.value === size) return
    pageSize.value = size
    page.value = 1
    await refresh()
  }

  async function resetAndRefresh(): Promise<void> {
    page.value = 1
    await refresh()
  }

  async function openFolder(path: string): Promise<void> {
    listingMode.value = 'folder'
    pathPrefix.value = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    page.value = 1
    await refresh()
  }

  async function goUp(): Promise<void> {
    if (!pathPrefix.value) return
    const parts = pathPrefix.value.split('/').filter(Boolean)
    parts.pop()
    await openFolder(parts.join('/'))
  }

  function openUploadDialog(): void {
    if (!uploadFolder.value.trim() && pathPrefix.value) {
      uploadFolder.value = pathPrefix.value
    }
    errorMessage.value = null
    showUploadDialog.value = true
  }

  function closeUploadDialog(): void {
    if (isUploading.value) return
    showUploadDialog.value = false
    uploadProgress.value = ''
  }

  function useCurrentFolderForUpload(): void {
    uploadFolder.value = pathPrefix.value
  }

  async function applyUploadResult(result: MultiUploadResult): Promise<void> {
    lastUpload.value = result
    const urls = result.urls?.filter(Boolean) ?? []
    if (urls.length) {
      try {
        await navigator.clipboard.writeText(urls.join('\n'))
      } catch {
        /* clipboard may be denied; still toast success */
      }
    }
    const done = result.uploaded + result.deduplicated
    if (result.errors.length) {
      errorMessage.value = result.errors.slice(0, 3).join('\n')
    }
    if (result.failed && !done) {
      toast.err(result.errors.slice(0, 2).join('；') || '上传失败')
      return
    }
    if (done) {
      toast.ok(urls.length ? `已上传 ${done} 张，直链已复制` : `已上传 ${done} 张`)
    } else {
      toast.info('没有新文件')
    }
    if (result.lastFile) {
      const parent = result.lastFile.relativePath
        .replace(/\\/g, '/')
        .split('/')
        .slice(0, -1)
        .join('/')
      pathPrefix.value = parent
      if (uploadFolder.value.trim()) {
        uploadFolder.value = parent
      }
      page.value = 1
      await refresh()
      if (result.lastFile.publicUrl) {
        preview.value = result.lastFile
      }
    } else {
      await refresh()
    }
    showUploadDialog.value = false
  }

  async function chooseImagePaths(): Promise<string[]> {
    try {
      return await bridgeInvoke('sync.chooseImagePaths')
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      toast.err(errorMessage.value)
      return []
    }
  }

  async function uploadLocalPaths(paths: string[]): Promise<void> {
    if (!paths.length || isUploading.value) return
    isUploading.value = true
    errorMessage.value = null
    infoMessage.value = null
    uploadProgress.value = `准备上传 ${paths.length} 个文件…`
    try {
      const folderPath = uploadFolder.value.trim() || undefined
      const result = await bridgeInvoke('sync.uploadPaths', { paths, folderPath })
      await applyUploadResult(result)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isUploading.value = false
      uploadProgress.value = ''
    }
  }

  async function chooseAndUpload(): Promise<void> {
    if (isUploading.value) return
    isUploading.value = true
    errorMessage.value = null
    infoMessage.value = null
    uploadProgress.value = '选择文件…'
    try {
      const folderPath = uploadFolder.value.trim() || undefined
      const result = await bridgeInvoke('sync.chooseAndUpload', { folderPath })
      if (!result) return
      await applyUploadResult(result)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isUploading.value = false
      uploadProgress.value = ''
    }
  }

  async function uploadClipboard(): Promise<void> {
    if (isUploading.value) return
    isUploading.value = true
    errorMessage.value = null
    infoMessage.value = null
    uploadProgress.value = '正在从剪贴板上传…'
    try {
      const folderPath = uploadFolder.value.trim() || undefined
      const one = await bridgeInvoke('sync.uploadClipboard', { folderPath })
      await applyUploadResult({
        uploaded: one.uploaded ? 1 : 0,
        deduplicated: one.deduplicated ? 1 : 0,
        failed: 0,
        errors: [],
        urls: one.file.publicUrl ? [one.file.publicUrl] : [],
        lastFile: one.file
      })
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isUploading.value = false
      uploadProgress.value = ''
    }
  }

  async function remove(id: number): Promise<void> {
    errorMessage.value = null
    infoMessage.value = null
    try {
      const res = await bridgeInvoke('sync.deleteFile', { id })
      if (!res.deleted) {
        errorMessage.value = '记录不存在或已在回收站'
        return
      }
      if (preview.value?.id === id) {
        preview.value = null
      }
      toast.ok('删除成功')
      await refresh()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      toast.err(errorMessage.value)
    }
  }

  async function restore(id: number): Promise<void> {
    errorMessage.value = null
    try {
      const res = await bridgeInvoke('sync.restoreFile', { id })
      if (!res.restored) {
        errorMessage.value = '记录不存在或不在回收站'
        return
      }
      if (preview.value?.id === id) preview.value = null
      toast.ok('已还原到素材库')
      await refresh()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      toast.err(errorMessage.value)
    }
  }

  async function purge(id: number): Promise<void> {
    errorMessage.value = null
    try {
      const res = await bridgeInvoke('sync.purgeFile', { id })
      if (!res.purged) {
        errorMessage.value = '记录不存在或不在回收站'
        return
      }
      if (preview.value?.id === id) preview.value = null
      toast.ok('已彻底删除（云端源对象与本地）；若使用 CDN，公开链接可能仍短暂命中缓存')
      await refresh()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      toast.err(errorMessage.value)
    }
  }

  async function copyUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      toast.ok('已复制链接')
    } catch {
      toast.err('复制失败，请手动选中链接')
    }
  }

  return {
    items,
    folders,
    total,
    search,
    statusFilter,
    pathPrefix,
    listingMode,
    scope,
    trashCount,
    uploadFolder,
    showUploadDialog,
    page,
    pageSize,
    pageCount,
    canPrev,
    canNext,
    rangeLabel,
    breadcrumbs,
    isSearching,
    isEmpty,
    isLoading,
    isUploading,
    uploadProgress,
    errorMessage,
    infoMessage,
    preview,
    lastUpload,
    refresh,
    setListingMode,
    resetAndRefresh,
    goToPage,
    prevPage,
    nextPage,
    setPageSize,
    openFolder,
    goUp,
    openUploadDialog,
    closeUploadDialog,
    useCurrentFolderForUpload,
    uploadLocalPaths,
    chooseImagePaths,
    chooseAndUpload,
    uploadClipboard,
    remove,
    restore,
    purge,
    openTrash,
    closeTrash,
    refreshTrashCount,
    copyUrl
  }
})
