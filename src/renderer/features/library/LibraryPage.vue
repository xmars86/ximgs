<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SyncFileDto, SyncFileStatusCounts, SyncFolderDto } from '@shared/sync'
import { bridgeInvoke } from '../../shared/bridge/client'
import { useSyncStore } from '../sync/useSyncStore'
import { PAGE_SIZE_OPTIONS, useGalleryStore, type GalleryPageSize } from './useGalleryStore'
import UploadDialog from './components/UploadDialog.vue'
import UiIcon from '../../shared/ui/UiIcon.vue'
import { toast } from '../../shared/ui/useToast'

type ViewMode = 'table' | 'grid' | 'tree'
type LinkFmt = 'url' | 'md' | 'html' | 'ubb'
type SortKey = 'syncedAt' | 'name' | 'size'

const { t, locale } = useI18n()
const gallery = useGalleryStore()
const sync = useSyncStore()
const searchDraft = ref('')
const viewMode = ref<ViewMode>('grid')
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
let searchTimer: ReturnType<typeof setTimeout> | null = null

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

onMounted(async () => {
  searchDraft.value = gallery.search
  await Promise.all([sync.refreshAll().catch(() => undefined), gallery.refresh(), refreshCounts()])
  await ensureTreeChildren('')
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

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
  selectedId.value = null
  if (mode === 'tree') {
    await gallery.setListingMode('folder')
    treeExpanded[''] = true
    await ensureTreeChildren('')
  } else {
    await gallery.setListingMode('flat')
  }
})

async function refreshCounts(): Promise<void> {
  try {
    statusCounts.value = await bridgeInvoke('sync.getStatusCounts')
  } catch {
    /* keep last */
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([gallery.refresh(), refreshCounts()])
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
  const d = new Date(iso)
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
  const d = new Date(iso)
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

function fileTypeLabel(path: string): string {
  const name = fileName(path)
  const i = name.lastIndexOf('.')
  const ext = i > 0 ? name.slice(i + 1).toUpperCase() : ''
  if (!ext) return t('library.fileType')
  return t('library.imageType', { ext })
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

async function ensureTreeChildren(path: string): Promise<void> {
  const key = path || ''
  if (treeChildren[key] || treeLoading[key]) return
  treeLoading[key] = true
  try {
    const res = await bridgeInvoke('sync.browseFiles', {
      limit: 1,
      offset: 0,
      pathPrefix: key || undefined,
      status: gallery.statusFilter || undefined
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

async function copyText(text: string): Promise<void> {
  if (!text || text === '—') return
  await navigator.clipboard.writeText(text)
  toast.ok(t('library.copied'))
}

async function exportVisibleLinks(): Promise<void> {
  const urls = sortedItems.value.map((i) => i.publicUrl).filter((u): u is string => Boolean(u))
  if (!urls.length) {
    gallery.infoMessage = t('library.exportEmpty')
    return
  }
  await navigator.clipboard.writeText(urls.join('\n'))
  gallery.infoMessage = t('library.exportDone', { n: urls.length })
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
    const kids = treeChildren[parent] || (parent === '' ? sortedFolders.value : [])
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
        <h1>{{ t('library.title') }}</h1>
        <p class="sub">{{ subtitleText }}</p>
      </div>
      <div class="hd-actions">
        <button type="button" class="btn" :disabled="gallery.isLoading" @click="refreshAll()">
          <UiIcon name="refresh" :size="15" />
          {{ t('library.rescan') }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="!sortedItems.length && viewMode !== 'tree'"
          @click="exportVisibleLinks"
        >
          <UiIcon name="copy" :size="15" />
          {{ t('library.exportLinks') }}
        </button>
        <button
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
            <span class="badge mute">{{ t('library.itemsBadge', { n: statusCounts.all || gallery.total }) }}</span>
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
          <div class="chips">
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
          <select v-model="sortKey" class="select sort-select" style="width: 132px; height: 30px">
            <option value="syncedAt">{{ t('library.sortSynced') }}</option>
            <option value="name">{{ t('library.sortName') }}</option>
            <option value="size">{{ t('library.sortSize') }}</option>
          </select>
          <div class="seg">
            <button type="button" :class="{ on: viewMode === 'grid' }" @click="viewMode = 'grid'">
              <UiIcon name="grid" :size="13" />
              {{ t('library.viewGrid') }}
            </button>
            <button type="button" :class="{ on: viewMode === 'table' }" @click="viewMode = 'table'">
              <UiIcon name="table" :size="13" />
              {{ t('library.viewList') }}
            </button>
            <button type="button" :class="{ on: viewMode === 'tree' }" @click="viewMode = 'tree'">
              <UiIcon name="folder" :size="13" />
              {{ t('library.viewTree') }}
            </button>
          </div>
        </div>

        <!-- ===== Grid ===== -->
        <template v-if="viewMode === 'grid'">
          <div v-if="gallery.isEmpty" class="empty" style="padding: 64px 20px">
            <div class="ico"><UiIcon name="image" :size="21" /></div>
            <b>{{ t('library.empty') }}</b>
            <p>{{ t('library.emptyHint') }}</p>
            <button type="button" class="btn primary" @click="gallery.openUploadDialog()">
              {{ t('library.uploadOne') }}
            </button>
          </div>
          <div v-else class="grid-view scroll" style="flex: 1; min-height: 0">
            <div
              v-for="item in sortedItems"
              :key="item.id"
              class="asset"
              role="button"
              tabindex="0"
              @click="openPreview(item)"
              @keydown.enter.prevent="openPreview(item)"
            >
              <div class="img">
                <img
                  v-if="item.publicUrl"
                  :src="item.publicUrl"
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
            <div class="ico"><UiIcon name="image" :size="21" /></div>
            <b>{{ t('library.empty') }}</b>
            <p>{{ t('library.emptyHint') }}</p>
            <button type="button" class="btn primary" @click="gallery.openUploadDialog()">
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
                        <img
                          v-if="item.publicUrl"
                          class="thumb"
                          :src="item.publicUrl"
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
                <span class="ct">{{ statusCounts.all }}</span>
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
            </aside>

            <div class="ex-list">
              <div class="ex-head">
                <div>{{ t('library.colName') }}</div>
                <div>{{ t('library.colModified') }}</div>
                <div>{{ t('library.colType') }}</div>
                <div>{{ t('library.colSize') }}</div>
                <div>{{ t('library.colStatus') }}</div>
                <div>{{ t('library.colUrl') }}</div>
              </div>
              <div class="ex-rows scroll">
                <div v-if="gallery.isEmpty" class="ex-empty">{{ t('library.emptyFolder') }}</div>
                <div
                  v-for="folder in sortedFolders"
                  :key="`ex-f-${folder.path}`"
                  class="ex-row"
                  @dblclick="openFolderRow(folder.path)"
                  @click="selectedId = null"
                >
                  <div class="nm">
                    <UiIcon name="folder" :size="16" class="fi" />
                    <span>{{ folder.name }}</span>
                  </div>
                  <div class="dim">—</div>
                  <div class="dim">{{ t('library.folder') }}</div>
                  <div class="dim">—</div>
                  <div class="dim">—</div>
                  <div class="dim">—</div>
                </div>
                <div
                  v-for="item in sortedItems"
                  :key="`ex-${item.id}`"
                  class="ex-row"
                  :class="{ on: selectedId === item.id }"
                  @click="selectRow(item)"
                  @dblclick="openPreview(item)"
                >
                  <div class="nm">
                    <img
                      v-if="item.publicUrl"
                      class="thumb"
                      :src="item.publicUrl"
                      alt=""
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <UiIcon v-else name="image" :size="16" class="fi" style="color: var(--text-3)" />
                    <span>{{ fileName(item.relativePath) }}</span>
                  </div>
                  <div class="dim">{{ formatExplorerDate(item.syncedAt || item.updatedAt) }}</div>
                  <div class="dim">{{ fileTypeLabel(item.relativePath) }}</div>
                  <div class="dim">{{ formatBytes(item.byteSize) }}</div>
                  <div>
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
                  <div class="lnk">
                    <button
                      v-if="item.publicUrl"
                      type="button"
                      class="btn sm ghost"
                      @click.stop="copyText(item.publicUrl)"
                    >
                      <UiIcon name="copy" :size="13" />
                    </button>
                    <span v-else class="dim">—</span>
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
    <aside class="drawer" :class="{ show: !!gallery.preview }">
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
        <div class="drawer-bd">
          <div class="drawer-preview">
            <img
              v-if="gallery.preview.publicUrl"
              :src="gallery.preview.publicUrl"
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
          <button type="button" class="btn danger" @click="onDelete(gallery.preview.id)">
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
.img-ph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--text-3);
}

.thumb.ph {
  display: grid;
  place-items: center;
  background: var(--surface-3);
  color: var(--text-3);
}
</style>
