<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { SyncFileDto, SyncFileStatusCounts, SyncFolderDto } from '@shared/sync'
import { parseAppDate } from '@shared/datetime'
import { bridgeInvoke } from '../../shared/bridge/client'
import { useSyncStore } from '../sync/useSyncStore'
import { PAGE_SIZE_OPTIONS, useGalleryStore, type GalleryPageSize } from './useGalleryStore'
import UploadDialog from './components/UploadDialog.vue'
import UiIcon from '../../shared/ui/UiIcon.vue'
import { showToast, toast } from '../../shared/ui/useToast'

type ViewMode = 'table' | 'grid' | 'tree'
type LinkFmt = 'url' | 'md' | 'html' | 'ubb'
type SortKey = 'syncedAt' | 'name' | 'size'

const { t, locale } = useI18n()
const route = useRoute()
const gallery = useGalleryStore()
const sync = useSyncStore()
const isTrashRoute = computed(() => route.name === 'trash')
const searchDraft = ref('')
const treeSearchDraft = ref('')
const viewMode = ref<ViewMode>('tree')
const sortKey = ref<SortKey>('syncedAt')
const linkFmt = ref<LinkFmt>('url')
const selectedId = ref<number | null>(null)
const pathHistory = ref<string[]>([])
const statusCounts = ref<SyncFileStatusCounts>({
  all: 0,
  synced: 0,
  pending: 0,
  error: 0,
  skipped: 0,
  totalBytes: 0
})
const treeChildren = reactive<Record<string, SyncFolderDto[]>>({})
const treeExpanded = reactive<Record<string, boolean>>({ '': true })
const treeLoading = reactive<Record<string, boolean>>({})
const gridScrollEl = ref<HTMLElement | null>(null)
const gridColCount = ref(4)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let gridResizeObserver: ResizeObserver | null = null

const GRID_COL_MIN = 200
const GRID_COL_GAP = 14

function updateGridColCount(width: number): void {
  const n = Math.floor((width + GRID_COL_GAP) / (GRID_COL_MIN + GRID_COL_GAP))
  gridColCount.value = Math.max(2, Math.min(6, n || 2))
}

function bindGridResizeObserver(): void {
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
  const el = gridScrollEl.value
  if (!el || typeof ResizeObserver === 'undefined') return
  updateGridColCount(el.clientWidth)
  gridResizeObserver = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width
    if (w != null) updateGridColCount(w)
  })
  gridResizeObserver.observe(el)
}

const statusChips = computed(() => [
  { value: '', label: t('library.statusAll'), count: statusCounts.value.all },
  { value: 'synced', label: t('library.statusSynced'), count: statusCounts.value.synced },
  { value: 'pending', label: t('library.statusPending'), count: statusCounts.value.pending },
  { value: 'error', label: t('library.statusError'), count: statusCounts.value.error }
])

const subtitleText = computed(() => {
  const n = statusCounts.value.all || gallery.total
  const folder = sync.config?.watchFolder
  const size = formatBytes(statusCounts.value.totalBytes || null)
  if (folder && n) return t('library.subtitleFull', { n, size, folder })
  if (n) return t('library.subtitleStats', { n })
  return t('library.subtitle')
})

const sortedFolders = computed(() =>
  [...gallery.folders].sort((a, b) => a.name.localeCompare(b.name, locale.value))
)

const sortedItems = computed(() => {
  const list = [...gallery.items]
  if (sortKey.value === 'name') {
    list.sort((a, b) =>
      fileName(a.relativePath).localeCompare(fileName(b.relativePath), locale.value)
    )
  } else if (sortKey.value === 'size') {
    list.sort((a, b) => (b.byteSize ?? 0) - (a.byteSize ?? 0))
  } else {
    list.sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || '')))
  }
  return list
})

/** Distribute L→R across columns for waterfall reading order. */
const gridColumns = computed(() => {
  const cols: (typeof sortedItems.value)[] = Array.from({ length: gridColCount.value }, () => [])
  sortedItems.value.forEach((item, i) => {
    cols[i % gridColCount.value]!.push(item)
  })
  return cols
})

const displayPath = computed(() => {
  const root = sync.config?.watchFolder?.replace(/[/\\]+$/, '') || t('library.rootFolder')
  return root.replace(/\//g, '\\')
})

const crumbTrail = computed(() => {
  const folder = sync.config?.watchFolder
  const parts = folder
    ? folder.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean)
    : []
  const crumbs: { label: string; path: string; isVirtual?: boolean }[] = [
    { label: t('library.thisPc'), path: '', isVirtual: true }
  ]
  // Virtual disk crumbs (display only) + real relative path crumbs
  for (const part of parts) {
    crumbs.push({ label: part, path: '', isVirtual: true })
  }
  const rel = gallery.pathPrefix ? gallery.pathPrefix.split('/').filter(Boolean) : []
  let acc = ''
  for (const part of rel) {
    acc = acc ? `${acc}/${part}` : part
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
})

const canGoBack = computed(() => pathHistory.value.length > 0)

const previewLink = computed(() => {
  const item = gallery.preview
  if (!item?.publicUrl) return '—'
  const url = item.publicUrl
  const name = fileName(item.relativePath)
  if (linkFmt.value === 'md') return `![${name}](${url})`
  if (linkFmt.value === 'html') return `<img src="${url}" alt="${name}" />`
  if (linkFmt.value === 'ubb') return `[img]${url}[/img]`
  return url
})

const selectedItem = computed(() => {
  if (selectedId.value == null) return null
  return gallery.items.find((i) => i.id === selectedId.value) ?? null
})

const explorerItemCount = computed(() => gallery.folders.length + gallery.items.length)

/** Left tree root badge: active library totals vs recycle-bin total. */
const treeRootCount = computed(() =>
  gallery.scope === 'trash' ? gallery.trashCount : statusCounts.value.all
)

async function syncScopeFromRoute(): Promise<void> {
  selectedId.value = null
  pathHistory.value = []
  clearTreeCache()
  if (isTrashRoute.value) {
    viewMode.value = 'tree'
    if (gallery.scope !== 'trash') await gallery.openTrash()
    else await gallery.refresh()
    await ensureTreeChildren('')
  } else if (gallery.scope === 'trash') {
    await gallery.closeTrash()
    if (viewMode.value === 'tree') {
      await gallery.setListingMode('folder')
      await ensureTreeChildren('')
    }
  } else {
    await gallery.refresh()
    if (viewMode.value === 'tree') await ensureTreeChildren('')
  }
}

onMounted(async () => {
  searchDraft.value = gallery.search
  if (isTrashRoute.value) {
    viewMode.value = 'tree'
  } else if (viewMode.value === 'tree') {
    await gallery.setListingMode('folder')
    treeExpanded[''] = true
  }
  await sync.refreshAll().catch(() => undefined)
  await syncScopeFromRoute()
  await refreshCounts()
  if (viewMode.value === 'tree') await ensureTreeChildren('')
  if (viewMode.value === 'grid') await nextTick(() => bindGridResizeObserver())
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
})

watch(
  () => route.name,
  () => {
    void (async () => {
      await syncScopeFromRoute()
      await refreshCounts()
    })()
  }
)

watch(
  () => gallery.statusFilter,
  () => {
    void gallery.resetAndRefresh()
  }
)

watch(searchDraft, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    gallery.search = value
    void gallery.resetAndRefresh()
  }, 280)
})

watch(
  () => gallery.pathPrefix,
  () => {
    void ensureTreeChildren(gallery.pathPrefix)
  }
)

watch(viewMode, async (mode) => {
  if (isTrashRoute.value && mode !== 'tree') {
    viewMode.value = 'tree'
    return
  }
  selectedId.value = null
  if (mode === 'tree') {
    gridResizeObserver?.disconnect()
    gridResizeObserver = null
    await gallery.setListingMode('folder')
    treeExpanded[''] = true
    await ensureTreeChildren('')
  } else {
    await gallery.setListingMode('flat')
    if (mode === 'grid') {
      await nextTick(() => bindGridResizeObserver())
    } else {
      gridResizeObserver?.disconnect()
      gridResizeObserver = null
    }
  }
})

watch(
  () => [viewMode.value, gallery.isEmpty] as const,
  async ([mode, empty]) => {
    if (mode === 'grid' && !empty) await nextTick(() => bindGridResizeObserver())
  }
)

async function refreshCounts(): Promise<void> {
  try {
    statusCounts.value = await bridgeInvoke('sync.getStatusCounts')
  } catch {
    /* keep last */
  }
}

async function refreshAll(): Promise<void> {
  clearTreeCache()
  await Promise.all([gallery.refresh(), refreshCounts()])
  if (viewMode.value === 'tree') await ensureTreeChildren('')
}

async function onPageSizeChange(event: Event): Promise<void> {
  const value = Number((event.target as HTMLSelectElement).value) as GalleryPageSize
  if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) {
    await gallery.setPageSize(value)
  }
}

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function parentPath(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i > 0 ? norm.slice(0, i) : ''
}

function displayRelPath(path: string): string {
  return parentPath(path).replace(/\//g, '\\')
}

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = parseAppDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hm = d.toLocaleTimeString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  if (sameDay) return t('library.todayAt', { time: hm })
  return d.toLocaleString(locale.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatExplorerDate(iso: string | null): string {
  if (!iso) return '—'
  const d = parseAppDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function previewSrc(item: { publicUrl?: string | null; thumbLocalPath?: string | null }): string | null {
  return item.thumbLocalPath || item.publicUrl || null
}

function isVideoPath(path: string | null | undefined): boolean {
  return /\.(mp4|mov|m4v|webm|avi)$/i.test(path || '')
}

function shortUrl(url: string | null): string {
  if (!url) return '—'
  try {
    const u = new URL(url)
    const tail = u.pathname.split('/').filter(Boolean).slice(-1)[0] || ''
    return `…/${decodeURIComponent(tail)}`
  } catch {
    return url.length > 36 ? `…${url.slice(-34)}` : url
  }
}

function shortMd5(md5: string | null): string {
  if (!md5) return '—'
  return md5.slice(0, 8)
}

function statusLabel(status: string): string {
  if (status === 'synced') return t('library.statusSynced')
  if (status === 'error') return t('library.statusError')
  if (status === 'pending' || status === 'queued') return t('library.statusPending')
  if (status === 'skipped') return t('library.statusSkipped')
  return status
}

async function navigateTo(path: string, pushHistory = true): Promise<void> {
  if (pushHistory && gallery.pathPrefix !== path) {
    pathHistory.value = [...pathHistory.value, gallery.pathPrefix]
  }
  selectedId.value = null
  await gallery.openFolder(path)
  treeExpanded[''] = true
  if (path) {
    const parts = path.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      treeExpanded[acc] = true
      await ensureTreeChildren(acc)
    }
  }
}

async function goBack(): Promise<void> {
  const prev = pathHistory.value.pop()
  if (prev === undefined) return
  await navigateTo(prev, false)
}

async function openFolderRow(path: string): Promise<void> {
  await navigateTo(path, true)
}

function clearTreeCache(): void {
  for (const key of Object.keys(treeChildren)) delete treeChildren[key]
  for (const key of Object.keys(treeLoading)) delete treeLoading[key]
  for (const key of Object.keys(treeExpanded)) {
    if (key !== '') delete treeExpanded[key]
  }
  treeExpanded[''] = true
}

function treeCacheKey(path: string): string {
  // Scope-prefix so library ↔ trash never share stale folder counts.
  return `${gallery.scope}:${path || ''}`
}

async function ensureTreeChildren(path: string): Promise<void> {
  const key = treeCacheKey(path)
  if (treeChildren[key] !== undefined || treeLoading[key]) return
  treeLoading[key] = true
  try {
    const res = await bridgeInvoke('sync.browseFiles', {
      limit: 1,
      offset: 0,
      pathPrefix: path || undefined,
      status: gallery.scope === 'trash' ? undefined : gallery.statusFilter || undefined,
      trashOnly: gallery.scope === 'trash'
    })
    treeChildren[key] = res.folders
  } catch {
    treeChildren[key] = []
  } finally {
    treeLoading[key] = false
  }
}

async function toggleTree(path: string): Promise<void> {
  const open = !treeExpanded[path]
  treeExpanded[path] = open
  if (open) await ensureTreeChildren(path)
}

function openPreview(item: SyncFileDto): void {
  selectedId.value = item.id
  gallery.preview = item
  linkFmt.value = 'url'
}

function selectRow(item: SyncFileDto): void {
  selectedId.value = item.id
}

async function onDelete(id: number): Promise<void> {
  if (!window.confirm(t('library.confirmDelete'))) return
  await gallery.remove(id)
  if (gallery.preview?.id === id) gallery.preview = null
  if (selectedId.value === id) selectedId.value = null
  await refreshCounts()
}

async function onRestore(id: number): Promise<void> {
  await gallery.restore(id)
  if (gallery.preview?.id === id) gallery.preview = null
  if (selectedId.value === id) selectedId.value = null
  await refreshCounts()
}

async function onPurge(id: number): Promise<void> {
  if (!window.confirm(t('library.confirmPurge'))) return
  await gallery.purge(id)
  if (gallery.preview?.id === id) gallery.preview = null
  if (selectedId.value === id) selectedId.value = null
  clearTreeCache()
  await refreshCounts()
  if (viewMode.value === 'tree') await ensureTreeChildren('')
}

async function copyText(text: string): Promise<void> {
  if (!text || text === '—') return
  await navigator.clipboard.writeText(text)
  toast.ok(t('library.copied'))
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** All files under current path (recursive), respecting search/status filters. */
async function fetchExportCandidates(): Promise<SyncFileDto[]> {
  const pageLimit = 500
  const all: SyncFileDto[] = []
  let offset = 0
  let total = Infinity
  const pathPrefix =
    gallery.listingMode === 'folder' ? gallery.pathPrefix || undefined : undefined
  while (offset < total) {
    const res = await bridgeInvoke('sync.listFiles', {
      limit: pageLimit,
      offset,
      search: gallery.search.trim() || undefined,
      status: gallery.statusFilter || undefined,
      pathPrefix,
      directOnly: false
    })
    all.push(...res.items)
    total = res.total
    if (!res.items.length) break
    offset += res.items.length
  }
  return all
}

async function exportVisibleLinks(): Promise<void> {
  try {
    const candidates = await fetchExportCandidates()
    const rows = candidates.filter((i) => Boolean(i.publicUrl))
    if (!rows.length) {
      showToast(t('library.exportEmpty'), 'info', 3000)
      return
    }

    const header = [
      t('library.exportColName'),
      t('library.exportColPath'),
      t('library.exportColUrl'),
      t('library.exportColStatus'),
      t('library.exportColSize'),
      t('library.exportColSyncedAt')
    ]
    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((item) =>
        [
          fileName(item.relativePath),
          displayRelPath(item.relativePath),
          item.publicUrl || '',
          statusLabel(item.status),
          item.byteSize != null ? String(item.byteSize) : '',
          item.syncedAt || item.updatedAt || ''
        ]
          .map((cell) => csvEscape(cell))
          .join(',')
      )
    ]
    // BOM helps Excel open UTF-8 CSV correctly
    const content = `\uFEFF${lines.join('\r\n')}\r\n`
    const stamp = new Date().toISOString().slice(0, 10)
    const res = await bridgeInvoke('system.saveTextFile', {
      content,
      defaultPath: `ximgs-links-${stamp}.csv`,
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (!res.saved) return
    showToast(t('library.exportDone', { n: rows.length }), 'ok', 3000)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    toast.err(msg)
  }
}

async function retryFailed(): Promise<void> {
  try {
    await sync.retryFailed()
    await refreshAll()
  } catch {
    /* toast via store */
  }
}

function openInBrowser(url: string | null): void {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function treeIndent(depth: number): string {
  return `${6 + depth * 14}px`
}

/** Flatten visible tree nodes for rendering (root children + expanded descendants). */
const visibleTreeNodes = computed(() => {
  const out: { folder: SyncFolderDto; depth: number }[] = []
  function walk(parent: string, depth: number): void {
    const cached = treeChildren[treeCacheKey(parent)]
    // Prefer loaded tree cache; fall back to current browse folders only at root.
    let kids =
      cached !== undefined
        ? cached
        : parent === ''
          ? sortedFolders.value
          : []
    if (parent === '') {
      const query = treeSearchDraft.value.trim().toLocaleLowerCase(locale.value)
      if (query) {
        kids = kids.filter((folder) => folder.name.toLocaleLowerCase(locale.value).includes(query))
      }
    }
    for (const folder of kids) {
      out.push({ folder, depth })
      if (treeExpanded[folder.path]) walk(folder.path, depth + 1)
    }
  }
  walk('', 0)
  return out
})
</script>

<template>
  <div class="page-root">
    <div class="main-hd">
      <div>
        <h1>{{ gallery.scope === 'trash' ? t('library.trashTitle') : t('library.title') }}</h1>
        <p class="sub">
          {{ gallery.scope === 'trash' ? t('library.trashSubtitle') : subtitleText }}
        </p>
      </div>
      <div class="hd-actions">
        <button type="button" class="btn" :disabled="gallery.isLoading" @click="refreshAll()">
          <UiIcon name="refresh" :size="15" />
          {{ t('library.rescan') }}
        </button>
        <button
          v-if="gallery.scope !== 'trash'"
          type="button"
          class="btn"
          :disabled="gallery.isLoading"
          @click="exportVisibleLinks"
        >
          <UiIcon name="copy" :size="15" />
          {{ t('library.exportLinks') }}
        </button>
        <button
          v-if="gallery.scope !== 'trash'"
          type="button"
          class="btn primary"
          :disabled="gallery.isUploading"
          @click="gallery.openUploadDialog()"
        >
          <UiIcon name="upload" :size="15" />
          {{ t('library.uploadOne') }}
        </button>
      </div>
    </div>

    <div class="main-bd scroll" style="display: flex; flex-direction: column; min-height: 0">
      <div v-if="gallery.errorMessage" class="banner-inline error">{{ gallery.errorMessage }}</div>
      <div v-if="gallery.infoMessage" class="banner-inline ok">{{ gallery.infoMessage }}</div>

      <div
        class="card"
        :class="{ 'tree-mode': viewMode === 'tree' }"
        style="display: flex; flex-direction: column; min-height: 0; flex: 1"
      >
        <div class="files-toolbar">
          <div class="tree-summary">
            <UiIcon name="folder" :size="15" />
            <span class="mono">{{ displayPath }}</span>
            <span class="badge mute">
              {{
                t('library.itemsBadge', {
                  n: gallery.scope === 'trash' ? gallery.trashCount : statusCounts.all || gallery.total
                })
              }}
            </span>
          </div>
          <div class="files-search">
            <UiIcon name="search" :size="14" />
            <input
              v-model="searchDraft"
              class="input"
              type="search"
              :placeholder="t('library.searchPlaceholder')"
            />
          </div>
          <div v-if="gallery.scope !== 'trash'" class="chips">
            <button
              v-for="chip in statusChips"
              :key="chip.value || 'all'"
              type="button"
              class="chip"
              :class="{ on: gallery.statusFilter === chip.value }"
              @click="gallery.statusFilter = chip.value"
            >
              {{ chip.label }}
              <span class="n">{{ chip.count }}</span>
            </button>
          </div>
          <div class="spacer" />
          <select
            v-if="gallery.scope !== 'trash'"
            v-model="sortKey"
            class="select sort-select"
            style="width: 132px; height: 30px"
          >
            <option value="syncedAt">{{ t('library.sortSynced') }}</option>
            <option value="name">{{ t('library.sortName') }}</option>
            <option value="size">{{ t('library.sortSize') }}</option>
          </select>
          <div class="seg">
            <button
              type="button"
              :class="{ on: viewMode === 'grid' }"
              :disabled="gallery.scope === 'trash'"
              @click="viewMode = 'grid'"
            >
              <UiIcon name="grid" :size="13" />
              {{ t('library.viewGrid') }}
            </button>
            <button
              type="button"
              :class="{ on: viewMode === 'table' }"
              :disabled="gallery.scope === 'trash'"
              @click="viewMode = 'table'"
            >
              <UiIcon name="table" :size="13" />
              {{ t('library.viewList') }}
            </button>
            <button
              type="button"
              :class="{ on: viewMode === 'tree' }"
              @click="viewMode = 'tree'"
            >
              <UiIcon name="folder" :size="13" />
              {{ t('library.viewTree') }}
            </button>
          </div>
        </div>

        <!-- ===== Grid ===== -->
        <template v-if="viewMode === 'grid'">
          <div v-if="gallery.isEmpty" class="empty" style="padding: 64px 20px">
            <div class="ico">
              <UiIcon :name="gallery.scope === 'trash' ? 'trash' : 'image'" :size="21" />
            </div>
            <b>{{ gallery.scope === 'trash' ? t('library.emptyTrashList') : t('library.empty') }}</b>
            <p>{{ gallery.scope === 'trash' ? t('library.emptyTrashHint') : t('library.emptyHint') }}</p>
            <button
              v-if="gallery.scope !== 'trash'"
              type="button"
              class="btn primary"
              @click="gallery.openUploadDialog()"
            >
              {{ t('library.uploadOne') }}
            </button>
          </div>
          <div
            v-else
            ref="gridScrollEl"
            class="grid-scroll scroll"
            style="flex: 1; min-height: 0"
          >
            <div class="grid-view">
              <div v-for="(col, colIdx) in gridColumns" :key="colIdx" class="grid-view-col">
                <div
                  v-for="item in col"
                  :key="item.id"
                  class="asset"
                  role="button"
                  tabindex="0"
                  @click="openPreview(item)"
                  @keydown.enter.prevent="openPreview(item)"
                >
                  <div class="img">
                    <video
                      v-if="isVideoPath(item.relativePath) && previewSrc(item)"
                      :src="previewSrc(item)!"
                      muted
                      playsinline
                      preload="metadata"
                    />
                    <img
                      v-else-if="previewSrc(item)"
                      :src="previewSrc(item)!"
                      :alt="fileName(item.relativePath)"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <div v-else class="img-ph"><UiIcon name="image" :size="28" /></div>
                    <span
                      class="badge"
                      :class="{
                        ok: item.status === 'synced',
                        err: item.status === 'error',
                        mute: item.status !== 'synced' && item.status !== 'error'
                      }"
                    >
                      {{ statusLabel(item.status) }}
                    </span>
                  </div>
                  <div class="meta">
                    <div class="n-row">
                      <div class="n" :title="fileName(item.relativePath)">
                        {{ fileName(item.relativePath) }}
                      </div>
                      <button
                        v-if="item.publicUrl"
                        type="button"
                        class="btn sm ghost copy-btn"
                        :title="t('library.copy')"
                        :aria-label="t('library.copy')"
                        @click.stop="copyText(item.publicUrl)"
                      >
                        <UiIcon name="copy" :size="13" />
                      </button>
                    </div>
                    <div class="p">
                      {{ displayRelPath(item.relativePath) || '—' }} · {{ formatBytes(item.byteSize) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="files-foot">
            <span>{{ t('library.rangeTotal', { ...gallery.rangeLabel, n: gallery.total }) }}</span>
            <span class="spacer" />
            <button
              type="button"
              class="btn sm ghost"
              :disabled="!gallery.canPrev || gallery.isLoading"
              @click="gallery.prevPage()"
            >
              {{ t('library.prevPage') }}
            </button>
            <button
              type="button"
              class="btn sm"
              :disabled="!gallery.canNext || gallery.isLoading"
              @click="gallery.nextPage()"
            >
              {{ t('library.nextPage') }}
            </button>
          </div>
        </template>

        <!-- ===== Table ===== -->
        <template v-else-if="viewMode === 'table'">
          <div v-if="gallery.isEmpty" class="empty" style="padding: 64px 20px">
            <div class="ico">
              <UiIcon :name="gallery.scope === 'trash' ? 'trash' : 'image'" :size="21" />
            </div>
            <b>{{ gallery.scope === 'trash' ? t('library.emptyTrashList') : t('library.empty') }}</b>
            <p>{{ gallery.scope === 'trash' ? t('library.emptyTrashHint') : t('library.emptyHint') }}</p>
            <button
              v-if="gallery.scope !== 'trash'"
              type="button"
              class="btn primary"
              @click="gallery.openUploadDialog()"
            >
              {{ t('library.uploadOne') }}
            </button>
          </div>
          <template v-else>
            <div class="table-wrap scroll" style="flex: 1; min-height: 0">
              <table class="tbl">
                <thead>
                  <tr>
                    <th style="width: 32%">{{ t('library.colFile') }}</th>
                    <th style="width: 9%">{{ t('library.colSize') }}</th>
                    <th style="width: 11%">{{ t('library.colStatus') }}</th>
                    <th style="width: 11%">{{ t('library.colSyncedAt') }}</th>
                    <th style="width: 12%">MD5</th>
                    <th>{{ t('library.colUrl') }}</th>
                    <th style="width: 64px" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in sortedItems"
                    :key="item.id"
                    :class="{ on: selectedId === item.id }"
                    style="cursor: pointer"
                    @click="selectRow(item)"
                    @dblclick="openPreview(item)"
                  >
                    <td>
                      <div class="t-file">
                        <video
                          v-if="isVideoPath(item.relativePath) && previewSrc(item)"
                          class="thumb"
                          :src="previewSrc(item)!"
                          muted
                          playsinline
                          preload="metadata"
                        />
                        <img
                          v-else-if="previewSrc(item)"
                          class="thumb"
                          :src="previewSrc(item)!"
                          alt=""
                          loading="lazy"
                          referrerpolicy="no-referrer"
                        />
                        <div v-else class="thumb ph"><UiIcon name="image" :size="14" /></div>
                        <div style="min-width: 0">
                          <div class="nm">{{ fileName(item.relativePath) }}</div>
                          <div class="pt">{{ displayRelPath(item.relativePath) }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="tnum">{{ formatBytes(item.byteSize) }}</td>
                    <td>
                      <span
                        class="badge"
                        :class="{
                          ok: item.status === 'synced',
                          err: item.status === 'error',
                          mute: item.status !== 'synced' && item.status !== 'error'
                        }"
                      >
                        {{ statusLabel(item.status) }}
                      </span>
                    </td>
                    <td class="muted tnum">{{ formatTime(item.syncedAt) }}</td>
                    <td class="mono">{{ shortMd5(item.md5) }}</td>
                    <td>
                      <div v-if="item.publicUrl" class="copy-row">
                        <span class="u">{{ shortUrl(item.publicUrl) }}</span>
                        <button
                          type="button"
                          class="btn sm ghost"
                          @click.stop="copyText(item.publicUrl)"
                        >
                          <UiIcon name="copy" :size="13" />
                        </button>
                      </div>
                      <span v-else-if="item.lastError" class="muted" style="font-size: 11.5px">
                        {{ item.lastError }}
                      </span>
                      <span v-else>—</span>
                    </td>
                    <td>
                      <button
                        v-if="item.status === 'error'"
                        type="button"
                        class="btn sm ghost"
                        :disabled="sync.isBusy"
                        @click.stop="retryFailed"
                      >
                        {{ t('library.retry') }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="btn sm ghost"
                        @click.stop="openPreview(item)"
                      >
                        {{ t('library.detail') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="files-foot">
              <span>{{ t('library.rangeTotal', { ...gallery.rangeLabel, n: gallery.total }) }}</span>
              <span class="spacer" />
              <button
                type="button"
                class="btn sm ghost"
                :disabled="!gallery.canPrev || gallery.isLoading"
                @click="gallery.prevPage()"
              >
                {{ t('library.prevPage') }}
              </button>
              <button
                type="button"
                class="btn sm"
                :disabled="!gallery.canNext || gallery.isLoading"
                @click="gallery.nextPage()"
              >
                {{ t('library.nextPage') }}
              </button>
            </div>
          </template>
        </template>

        <!-- ===== Directory / Explorer ===== -->
        <div v-else class="explorer" style="flex: 1; min-height: 0">
          <div class="ex-bar">
            <div class="ex-nav">
              <button type="button" :disabled="!canGoBack" :title="t('library.goBack')" @click="goBack">
                <UiIcon name="arrowLeft" :size="14" />
              </button>
              <button
                type="button"
                :disabled="!gallery.pathPrefix"
                :title="t('library.goUp')"
                @click="navigateTo(parentPath(gallery.pathPrefix), true)"
              >
                <UiIcon name="arrowUp" :size="14" />
              </button>
            </div>
            <div class="crumb">
              <template v-for="(crumb, index) in crumbTrail" :key="`${crumb.label}-${index}`">
                <span v-if="index > 0" class="sep">›</span>
                <button
                  type="button"
                  :class="{ cur: index === crumbTrail.length - 1 }"
                  @click="navigateTo(crumb.isVirtual ? '' : crumb.path, true)"
                >
                  {{ crumb.label }}
                </button>
              </template>
            </div>
            <div class="ex-filter">
              <UiIcon name="search" :size="13" />
              <input
                v-model="searchDraft"
                class="input"
                type="search"
                :placeholder="t('library.searchInFolder')"
              />
            </div>
          </div>

          <div class="ex-body">
            <aside class="ex-tree scroll">
              <div class="ex-tree-label">{{ t('library.syncFolders') }}</div>
              <div class="ex-tree-search">
                <UiIcon name="search" :size="13" />
                <input
                  v-model="treeSearchDraft"
                  class="input"
                  type="search"
                  :placeholder="t('library.treeSearchPlaceholder')"
                />
              </div>
              <div
                class="tr"
                :class="{ on: !gallery.pathPrefix }"
                @click="navigateTo('', true)"
              >
                <span class="cv" />
                <UiIcon name="folder" :size="15" class="fi" />
                <span class="nmx">{{
                  sync.config?.watchFolder
                    ? fileName(sync.config.watchFolder.replace(/\\/g, '/'))
                    : t('library.rootFolder')
                }}</span>
                <span class="ct">{{ treeRootCount }}</span>
              </div>
              <div
                v-for="node in visibleTreeNodes"
                :key="node.folder.path"
                class="tr"
                :class="{ on: gallery.pathPrefix === node.folder.path }"
                :style="{ paddingLeft: treeIndent(node.depth) }"
                @click="navigateTo(node.folder.path, true)"
              >
                <button
                  type="button"
                  class="cv"
                  :class="{ open: treeExpanded[node.folder.path] }"
                  @click.stop="toggleTree(node.folder.path)"
                >
                  <UiIcon name="chevronRight" :size="12" />
                </button>
                <UiIcon name="folder" :size="15" class="fi" />
                <span class="nmx">{{ node.folder.name }}</span>
                <span class="ct">{{ node.folder.fileCount }}</span>
              </div>
              <div
                v-if="treeSearchDraft.trim() && visibleTreeNodes.length === 0"
                class="ex-tree-empty"
              >
                {{ t('library.treeSearchEmpty') }}
              </div>
            </aside>

            <div class="ex-list">
              <div class="ex-gallery-scroll scroll">
                <div class="ex-gallery">
                  <div v-if="gallery.isEmpty" class="ex-empty">{{ t('library.emptyFolder') }}</div>
                  <div
                    v-for="folder in sortedFolders"
                    :key="`ex-f-${folder.path}`"
                    class="ex-folder-card"
                    role="button"
                    tabindex="0"
                    @dblclick="openFolderRow(folder.path)"
                    @click="selectedId = null"
                    @keydown.enter.prevent="openFolderRow(folder.path)"
                  >
                    <div class="ex-folder-icon">
                      <UiIcon name="folder" :size="34" />
                    </div>
                    <div class="ex-card-name" :title="folder.name">{{ folder.name }}</div>
                    <div class="ex-card-sub">
                      {{ folder.fileCount }} {{ t('library.itemsUnit') }}
                    </div>
                  </div>
                  <div
                    v-for="item in sortedItems"
                    :key="`ex-${item.id}`"
                    class="ex-image-card"
                    :class="{ on: selectedId === item.id }"
                    role="button"
                    tabindex="0"
                    @click="selectRow(item)"
                    @dblclick="openPreview(item)"
                    @keydown.enter.prevent="openPreview(item)"
                  >
                    <div class="ex-image">
                      <video
                        v-if="isVideoPath(item.relativePath) && previewSrc(item)"
                        :src="previewSrc(item)!"
                        muted
                        playsinline
                        preload="metadata"
                      />
                      <img
                        v-else-if="previewSrc(item)"
                        :src="previewSrc(item)!"
                        :alt="fileName(item.relativePath)"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      />
                      <div v-else class="ex-image-placeholder">
                        <UiIcon name="image" :size="28" />
                      </div>
                      <span
                        class="badge"
                        :class="{
                          ok: item.status === 'synced',
                          err: item.status === 'error',
                          mute: item.status !== 'synced' && item.status !== 'error'
                        }"
                      >
                        {{ statusLabel(item.status) }}
                      </span>
                    </div>
                    <div class="ex-card-meta">
                      <div class="ex-card-name-row">
                        <div class="ex-card-name" :title="fileName(item.relativePath)">
                          {{ fileName(item.relativePath) }}
                        </div>
                        <button
                          v-if="item.publicUrl"
                          type="button"
                          class="btn sm ghost ex-copy"
                          :title="t('library.copy')"
                          :aria-label="t('library.copy')"
                          @click.stop="copyText(item.publicUrl)"
                        >
                          <UiIcon name="copy" :size="13" />
                        </button>
                      </div>
                      <div class="ex-card-sub">
                        {{ formatExplorerDate(item.syncedAt || item.updatedAt) }} ·
                        {{ formatBytes(item.byteSize) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="ex-foot">
            <span>
              <b>{{ explorerItemCount }}</b>
              {{ t('library.itemsUnit') }}
              <template v-if="selectedItem">
                · {{ t('library.selectedOne', { name: fileName(selectedItem.relativePath) }) }}
              </template>
              <template v-else> · {{ t('library.selectedNone') }}</template>
            </span>
            <span class="spacer" />
            <span>{{ t('library.explorerHint') }}</span>
          </div>
        </div>
      </div>
    </div>

    <UploadDialog />

    <div class="scrim" :class="{ show: !!gallery.preview }" @click="gallery.preview = null" />
    <aside class="drawer lib-drawer" :class="{ show: !!gallery.preview }">
      <template v-if="gallery.preview">
        <div class="drawer-hd">
          <h3>{{ fileName(gallery.preview.relativePath) }}</h3>
          <span
            class="badge"
            :class="{
              ok: gallery.preview.status === 'synced',
              err: gallery.preview.status === 'error',
              mute: gallery.preview.status !== 'synced' && gallery.preview.status !== 'error'
            }"
          >
            {{ statusLabel(gallery.preview.status) }}
          </span>
          <div class="spacer" />
          <button type="button" class="btn icon sm ghost" @click="gallery.preview = null">
            <UiIcon name="x" :size="14" />
          </button>
        </div>
        <div class="drawer-bd lib-drawer-bd">
          <div class="drawer-preview">
            <video
              v-if="isVideoPath(gallery.preview.relativePath) && previewSrc(gallery.preview)"
              :src="previewSrc(gallery.preview)!"
              controls
              playsinline
              preload="metadata"
            />
            <img
              v-else-if="previewSrc(gallery.preview)"
              :src="previewSrc(gallery.preview)!"
              :alt="fileName(gallery.preview.relativePath)"
              referrerpolicy="no-referrer"
            />
          </div>
          <div class="row" style="gap: 6px; flex-wrap: wrap">
            <button
              v-if="gallery.preview.publicUrl"
              type="button"
              class="btn sm"
              @click="copyText(gallery.preview.publicUrl)"
            >
              <UiIcon name="copy" :size="14" />
              {{ t('library.copy') }}
            </button>
            <button
              v-if="gallery.preview.publicUrl"
              type="button"
              class="btn sm"
              @click="openInBrowser(gallery.preview.publicUrl)"
            >
              <UiIcon name="external" :size="14" />
              {{ t('library.openBrowser') }}
            </button>
          </div>
          <div class="drawer-sect">{{ t('library.detailMeta') }}</div>
          <table class="kv-t">
            <tbody>
              <tr>
                <td>{{ t('library.colPath') }}</td>
                <td>{{ displayRelPath(gallery.preview.relativePath) || '—' }}</td>
              </tr>
              <tr>
                <td>{{ t('library.colSize') }}</td>
                <td>{{ formatBytes(gallery.preview.byteSize) }}</td>
              </tr>
              <tr>
                <td>MD5</td>
                <td class="mono">{{ gallery.preview.md5 || '—' }}</td>
              </tr>
              <tr>
                <td>{{ t('library.colObjectKey') }}</td>
                <td class="mono">{{ gallery.preview.objectKey || '—' }}</td>
              </tr>
              <tr>
                <td>{{ t('library.colSyncedAt') }}</td>
                <td>{{ formatTime(gallery.preview.syncedAt) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="drawer-sect">{{ t('library.linkFormats') }}</div>
          <div class="fmt">
            <button type="button" :class="{ on: linkFmt === 'url' }" @click="linkFmt = 'url'">URL</button>
            <button type="button" :class="{ on: linkFmt === 'md' }" @click="linkFmt = 'md'">Markdown</button>
            <button type="button" :class="{ on: linkFmt === 'html' }" @click="linkFmt = 'html'">HTML</button>
            <button type="button" :class="{ on: linkFmt === 'ubb' }" @click="linkFmt = 'ubb'">UBB</button>
          </div>
          <div class="code-box">{{ previewLink }}</div>
          <button
            type="button"
            class="btn sm"
            style="margin-top: 8px"
            :disabled="previewLink === '—'"
            @click="copyText(previewLink)"
          >
            <UiIcon name="copy" :size="13" />
            {{ t('library.copyFormat') }}
          </button>
        </div>
        <div class="drawer-ft">
          <template v-if="gallery.scope === 'trash'">
            <button type="button" class="btn" @click="onRestore(gallery.preview.id)">
              {{ t('library.restore') }}
            </button>
            <button type="button" class="btn danger" @click="onPurge(gallery.preview.id)">
              {{ t('library.purge') }}
            </button>
          </template>
          <button
            v-else
            type="button"
            class="btn danger"
            @click="onDelete(gallery.preview.id)"
          >
            {{ t('library.delete') }}
          </button>
          <div class="spacer" />
          <button type="button" class="btn" @click="gallery.preview = null">{{ t('library.close') }}</button>
        </div>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.thumb.ph {
  display: grid;
  place-items: center;
  background: var(--surface-3);
  color: var(--text-3);
}

.lib-drawer-bd {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.lib-drawer .drawer-sect {
  margin: 10px 0 6px;
}

.lib-drawer .code-box {
  max-height: 4.8em;
  overflow: auto;
}
</style>
