<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SkuDto } from '@shared/sku'
import { SKU_IMAGE_LIMIT, SKU_PAGE_SIZE } from '@shared/sku'
import { parseAppDate } from '@shared/datetime'
import UiIcon from '../../shared/ui/UiIcon.vue'
import { toast } from '../../shared/ui/useToast'
import SkuImportDialog from './SkuImportDialog.vue'
import { useSkuStore } from './useSkuStore'
import { useSyncStore } from '../sync/useSyncStore'

const { t, locale } = useI18n()
const store = useSkuStore()
const sync = useSyncStore()

const dialogOpen = ref(false)
const importOpen = ref(false)
const editingId = ref<number | null>(null)
const formError = ref<string | null>(null)
const form = reactive({
  sku: '',
  name: '',
  note: '',
  category: '',
  brand: '',
  barcode: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  grossWeightKg: '',
  netWeightKg: ''
})

const searchQuery = ref('')
const page = ref(1)

const isEditing = computed(() => editingId.value != null)
const detail = computed(() => store.detail)
const showPicker = ref(false)
const unbindMode = ref(false)
const pickerEl = ref<HTMLElement | null>(null)

const canAddMoreImages = computed(
  () => (detail.value?.images.length ?? 0) < SKU_IMAGE_LIMIT
)

const subtitleText = computed(() =>
  store.limit == null
    ? t('sku.subtitleStatsUnlimited', { n: store.count })
    : t('sku.subtitleStats', { n: store.count, limit: store.limit })
)

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return store.items
  return store.items.filter((row) => {
    const hay =
      `${row.sku} ${row.name} ${row.category ?? ''} ${row.brand ?? ''} ${row.barcode ?? ''} ${row.note ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
})

function formatDims(row: SkuDto): string {
  const parts = [row.lengthCm, row.widthCm, row.heightCm]
  if (parts.every((n) => n == null)) return '—'
  return `${parts.map((n) => (n == null ? '—' : trimNum(n))).join(' × ')} cm`
}

function formatKg(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${trimNum(value)} kg`
}

function formatWeightLine(row: SkuDto): string {
  const bits: string[] = []
  if (row.netWeightKg != null) bits.push(`${t('sku.netWeight')} ${trimNum(row.netWeightKg)} kg`)
  if (row.grossWeightKg != null) bits.push(`${t('sku.grossWeight')} ${trimNum(row.grossWeightKg)} kg`)
  return bits.join(' · ') || '—'
}

function rowNo(index: number): number {
  return (page.value - 1) * SKU_PAGE_SIZE + index + 1
}

async function copySku(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code)
    toast.ok(t('sku.copied'))
  } catch {
    toast.err(t('sku.copyFailed'))
  }
}

function trimNum(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

function parseOptionalNumber(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : Number.NaN
  }
  const text = String(raw).trim()
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : Number.NaN
}

const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / SKU_PAGE_SIZE)))
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < pageCount.value)

const rangeLabel = computed(() => {
  const total = filteredItems.value.length
  if (total === 0) return { from: 0, to: 0, n: 0 }
  const from = (page.value - 1) * SKU_PAGE_SIZE + 1
  const to = Math.min(page.value * SKU_PAGE_SIZE, total)
  return { from, to, n: total }
})

const pagedItems = computed(() => {
  const start = (page.value - 1) * SKU_PAGE_SIZE
  return filteredItems.value.slice(start, start + SKU_PAGE_SIZE)
})

const pickerCandidates = computed(() =>
  store.pickerItems.filter((f) => !store.boundSyncFileIds.has(f.id))
)

const pickerFolders = computed(() =>
  [...store.pickerFolders].sort((a, b) => a.name.localeCompare(b.name, locale.value))
)

const pickerRootLabel = computed(() => {
  const folder = sync.config?.watchFolder
  if (!folder) return t('library.rootFolder')
  return fileName(folder.replace(/\\/g, '/'))
})

const pickerCrumbs = computed(() => {
  const crumbs: { label: string; path: string }[] = [
    { label: pickerRootLabel.value, path: '' }
  ]
  const rel = store.pickerPathPrefix
    ? store.pickerPathPrefix.split('/').filter(Boolean)
    : []
  let acc = ''
  for (const part of rel) {
    acc = acc ? `${acc}/${part}` : part
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
})

const pickerIsEmpty = computed(
  () =>
    !store.pickerLoading &&
    !pickerFolders.value.length &&
    !pickerCandidates.value.length
)

const pickerAllSelected = computed(() => {
  const ids = pickerCandidates.value
  return (
    ids.length > 0 && ids.every((file) => store.pickerSelected.includes(file.id))
  )
})

function toggleSelectAllPicker(): void {
  const ids = pickerCandidates.value.map((file) => file.id)
  if (!ids.length) return
  store.setPickerSelection(ids, !pickerAllSelected.value)
}

onMounted(() => {
  void store.refresh()
  void sync.refreshAll().catch(() => undefined)
})

watch(searchQuery, () => {
  page.value = 1
})

watch(
  () => filteredItems.value.length,
  () => {
    if (page.value > pageCount.value) page.value = pageCount.value
  }
)

let pickerSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => store.pickerSearch,
  () => {
    if (!store.detailOpen) return
    if (pickerSearchTimer) clearTimeout(pickerSearchTimer)
    pickerSearchTimer = setTimeout(() => {
      store.pickerPage = 1
      void store.loadPicker()
    }, 280)
  }
)

function prevPage(): void {
  if (canPrev.value) page.value -= 1
}

function nextPage(): void {
  if (canNext.value) page.value += 1
}

function formatTime(iso: string): string {
  const d = parseAppDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale.value)
}

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function resetForm(): void {
  form.sku = ''
  form.name = ''
  form.note = ''
  form.category = ''
  form.brand = ''
  form.barcode = ''
  form.lengthCm = ''
  form.widthCm = ''
  form.heightCm = ''
  form.grossWeightKg = ''
  form.netWeightKg = ''
  formError.value = null
}

function openCreate(): void {
  if (store.atLimit) return
  editingId.value = null
  resetForm()
  dialogOpen.value = true
}

function openImport(): void {
  importOpen.value = true
}

function closeImport(): void {
  if (store.isBusy) return
  importOpen.value = false
}

function openEdit(row: SkuDto): void {
  editingId.value = row.id
  form.sku = row.sku
  form.name = row.name
  form.note = row.note ?? ''
  form.category = row.category ?? ''
  form.brand = row.brand ?? ''
  form.barcode = row.barcode ?? ''
  form.lengthCm = row.lengthCm == null ? '' : String(row.lengthCm)
  form.widthCm = row.widthCm == null ? '' : String(row.widthCm)
  form.heightCm = row.heightCm == null ? '' : String(row.heightCm)
  form.grossWeightKg = row.grossWeightKg == null ? '' : String(row.grossWeightKg)
  form.netWeightKg = row.netWeightKg == null ? '' : String(row.netWeightKg)
  formError.value = null
  dialogOpen.value = true
}

function editFromDetail(): void {
  if (!detail.value) return
  openEdit(detail.value.sku)
}

function closeDialog(): void {
  if (store.isBusy) return
  dialogOpen.value = false
  formError.value = null
}

async function submitForm(): Promise<void> {
  formError.value = null
  const sku = form.sku.trim()
  const name = form.name.trim()
  const note = form.note.trim()
  const category = form.category.trim()
  const brand = form.brand.trim()
  const barcode = form.barcode.trim()
  const lengthCm = parseOptionalNumber(form.lengthCm)
  const widthCm = parseOptionalNumber(form.widthCm)
  const heightCm = parseOptionalNumber(form.heightCm)
  const grossWeightKg = parseOptionalNumber(form.grossWeightKg)
  const netWeightKg = parseOptionalNumber(form.netWeightKg)
  if (!sku) {
    formError.value = t('sku.errSkuRequired')
    return
  }
  if (!name) {
    formError.value = t('sku.errNameRequired')
    return
  }
  if (
    [lengthCm, widthCm, heightCm, grossWeightKg, netWeightKg].some((n) =>
      Number.isNaN(n)
    )
  ) {
    formError.value = t('sku.errMeasureInvalid')
    return
  }
  const attrs = {
    note: note || null,
    category: category || null,
    brand: brand || null,
    barcode: barcode || null,
    lengthCm,
    widthCm,
    heightCm,
    grossWeightKg,
    netWeightKg
  }
  try {
    if (editingId.value != null) {
      await store.update({
        id: editingId.value,
        sku,
        name,
        ...attrs
      })
    } else {
      await store.create({
        sku,
        name,
        ...attrs
      })
    }
    dialogOpen.value = false
  } catch {
    formError.value = store.errorMessage
  }
}

async function confirmDelete(row: SkuDto): Promise<void> {
  if (!window.confirm(t('sku.deleteConfirm', { sku: row.sku }))) return
  await store.remove(row.id)
}

async function openDetail(row: SkuDto): Promise<void> {
  showPicker.value = false
  unbindMode.value = false
  await store.openDetail(row.id)
  showPicker.value = !store.detail?.images.length
}

async function togglePicker(): Promise<void> {
  showPicker.value = !showPicker.value
  if (!showPicker.value) return
  exitUnbindMode()
  await nextTick()
  pickerEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function enterUnbindMode(): void {
  if (!detail.value?.images.length) return
  showPicker.value = false
  unbindMode.value = true
  store.clearBoundSelected()
}

function exitUnbindMode(): void {
  unbindMode.value = false
  store.clearBoundSelected()
}

function closeDetail(): void {
  showPicker.value = false
  unbindMode.value = false
  store.closeDetail()
}

async function confirmUnbindSelected(): Promise<void> {
  const n = store.boundSelected.length
  if (!n) return
  const msg =
    n === 1
      ? t('sku.unbindConfirmOne')
      : t('sku.unbindConfirmN', { n })
  if (!window.confirm(msg)) return
  await store.unbindSelected()
  unbindMode.value = false
}

async function confirmBindSelected(): Promise<void> {
  if (!store.pickerHasSelection) return
  await store.bindSelected()
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (importOpen.value) {
    closeImport()
    return
  }
  if (dialogOpen.value) {
    closeDialog()
    return
  }
  if (unbindMode.value) {
    exitUnbindMode()
    return
  }
  if (showPicker.value) {
    showPicker.value = false
    return
  }
  if (store.detailOpen) closeDetail()
}
</script>

<template>
  <div class="page-root" @keydown="onDialogKeydown">
    <div class="main-hd">
      <div>
        <h1>{{ t('sku.title') }}</h1>
        <p class="sub">{{ subtitleText }}</p>
      </div>
      <div class="hd-actions">
        <button type="button" class="btn" :disabled="store.isBusy" @click="store.refresh()">
          <UiIcon name="refresh" :size="15" />
          {{ t('sku.refresh') }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="store.isBusy"
          @click="openImport"
        >
          <UiIcon name="upload" :size="15" />
          {{ t('sku.batchImport') }}
        </button>
        <button
          type="button"
          class="btn primary"
          :disabled="store.atLimit || store.isBusy"
          :title="store.atLimit ? t('sku.limitReached', { limit: store.limit }) : undefined"
          @click="openCreate"
        >
          <UiIcon name="plus" :size="15" />
          {{ t('sku.add') }}
        </button>
      </div>
    </div>

    <div class="main-bd" style="display: flex; flex-direction: column; min-height: 0; flex: 1">
      <div v-if="store.atLimit" class="banner-inline warn" style="margin-bottom: 12px">
        {{ t('sku.limitReached', { limit: store.limit }) }}
      </div>

      <div v-if="!store.items.length" class="card">
        <div class="empty">
          <div class="ico"><UiIcon name="tag" :size="21" /></div>
          <b>{{ t('sku.empty') }}</b>
          <p>
            {{
              store.limit == null
                ? t('sku.emptyHintUnlimited')
                : t('sku.emptyHint', { limit: store.limit })
            }}
          </p>
          <button
            type="button"
            class="btn primary"
            :disabled="store.atLimit || store.isBusy"
            @click="openCreate"
          >
            <UiIcon name="plus" :size="15" />
            {{ t('sku.add') }}
          </button>
        </div>
      </div>

      <div v-else class="card" style="flex: 1; min-height: 0; display: flex; flex-direction: column">
        <div class="card-hd">
          <h2>{{ t('sku.listTitle') }}</h2>
          <div class="list-search">
            <UiIcon name="search" :size="13" />
            <input
              v-model="searchQuery"
              class="input"
              type="search"
              :placeholder="t('sku.searchPlaceholder')"
            />
          </div>
          <div class="spacer" />
          <span class="chipx">
            {{ store.limit == null ? store.count : `${store.count} / ${store.limit}` }}
          </span>
        </div>
        <div v-if="!filteredItems.length" class="img-empty" style="margin: 16px">
          {{ t('sku.searchEmpty') }}
        </div>
        <template v-else>
          <div class="scroll" style="flex: 1; min-height: 0">
            <table class="tbl">
              <thead>
                <tr>
                  <th class="col-no">{{ t('sku.colNo') }}</th>
                  <th class="col-cover">{{ t('sku.colCover') }}</th>
                  <th>{{ t('sku.colSku') }}</th>
                  <th>{{ t('sku.colName') }}</th>
                  <th class="col-cat">{{ t('sku.colCategory') }}</th>
                  <th class="col-measure">{{ t('sku.colSizeWeight') }}</th>
                  <th class="col-images">{{ t('sku.colImages') }}</th>
                  <th class="col-time">{{ t('sku.colUpdated') }}</th>
                  <th class="col-ops">{{ t('sku.colActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, index) in pagedItems"
                  :key="row.id"
                  class="sku-row"
                  @click="openDetail(row)"
                >
                  <td class="muted tnum">{{ rowNo(index) }}</td>
                  <td>
                    <div class="cover-cell">
                      <img
                        v-if="row.coverUrl"
                        :src="row.coverUrl"
                        :alt="row.sku"
                        class="cover-thumb"
                      />
                      <div v-else class="cover-thumb ph">
                        <UiIcon name="image" :size="16" />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="cell-main">
                      <span class="mono sku-code">{{ row.sku }}</span>
                      <button
                        type="button"
                        class="link-ico"
                        :title="t('sku.copySku')"
                        :aria-label="t('sku.copySku')"
                        @click.stop="copySku(row.sku)"
                      >
                        <UiIcon name="copy" :size="12" />
                      </button>
                    </div>
                    <div v-if="row.barcode" class="cell-sub mono">{{ row.barcode }}</div>
                  </td>
                  <td>
                    <div class="cell-main">{{ row.name }}</div>
                    <div v-if="row.brand" class="cell-sub">{{ row.brand }}</div>
                  </td>
                  <td>
                    <span v-if="row.category" class="sku-tag">{{ row.category }}</span>
                    <span v-else class="muted">—</span>
                  </td>
                  <td>
                    <div class="cell-main mono">{{ formatDims(row) }}</div>
                    <div class="cell-sub">{{ formatWeightLine(row) }}</div>
                  </td>
                  <td class="muted tnum">{{ row.imageCount }}</td>
                  <td class="muted">{{ formatTime(row.updatedAt) }}</td>
                  <td @click.stop>
                    <div class="op-links">
                      <button type="button" class="op-link" @click="openDetail(row)">
                        {{ t('sku.detail') }}
                      </button>
                      <button
                        type="button"
                        class="op-link"
                        :disabled="store.isBusy"
                        @click="openEdit(row)"
                      >
                        {{ t('sku.edit') }}
                      </button>
                      <button
                        type="button"
                        class="op-link danger"
                        :disabled="store.isBusy"
                        @click="confirmDelete(row)"
                      >
                        {{ t('sku.delete') }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="list-foot">
            <span>{{ t('sku.rangeTotal', rangeLabel) }}</span>
            <div class="spacer" />
            <span class="muted page-ind">{{ t('sku.pageOf', { page, pages: pageCount }) }}</span>
            <button type="button" class="btn sm ghost" :disabled="!canPrev" @click="prevPage">
              {{ t('sku.prevPage') }}
            </button>
            <button type="button" class="btn sm" :disabled="!canNext" @click="nextPage">
              {{ t('sku.nextPage') }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Detail drawer -->
    <div class="scrim" :class="{ show: store.detailOpen && !dialogOpen }" @click="closeDetail" />
    <aside
      class="drawer sku-detail"
      :class="{ show: store.detailOpen }"
      role="dialog"
      aria-modal="true"
      :aria-label="t('sku.detailTitle')"
    >
      <template v-if="detail">
        <div class="drawer-hd">
          <div class="hd-text">
            <h3>{{ detail.sku.sku }}</h3>
            <div class="hd-sub">{{ detail.sku.name }}</div>
          </div>
          <div class="spacer" />
          <button
            type="button"
            class="btn sm primary"
            :disabled="store.isBusy"
            @click="editFromDetail"
          >
            {{ t('sku.edit') }}
          </button>
          <button
            type="button"
            class="btn sm danger"
            :disabled="store.isBusy"
            @click="confirmDelete(detail.sku)"
          >
            {{ t('sku.delete') }}
          </button>
          <button
            type="button"
            class="btn icon sm ghost"
            :aria-label="t('sku.close')"
            @click="closeDetail"
          >
            <UiIcon name="x" :size="14" />
          </button>
        </div>

        <div class="drawer-bd scroll">
          <div class="spec">
            <div class="spec-cover">
              <img
                v-if="detail.sku.coverUrl"
                :src="detail.sku.coverUrl"
                :alt="detail.sku.sku"
              />
              <div v-else class="spec-cover-ph">
                <UiIcon name="image" :size="28" />
              </div>
            </div>
            <table class="spec-table">
              <tbody>
                <tr>
                  <th>{{ t('sku.colSku') }}</th>
                  <td>
                    <span class="mono">{{ detail.sku.sku }}</span>
                    <button
                      type="button"
                      class="link-ico"
                      :title="t('sku.copySku')"
                      @click="copySku(detail.sku.sku)"
                    >
                      <UiIcon name="copy" :size="12" />
                    </button>
                  </td>
                  <th>{{ t('sku.colName') }}</th>
                  <td>{{ detail.sku.name }}</td>
                </tr>
                <tr>
                  <th>{{ t('sku.colBrand') }}</th>
                  <td>{{ detail.sku.brand || '—' }}</td>
                  <th>{{ t('sku.colBarcode') }}</th>
                  <td class="mono">{{ detail.sku.barcode || '—' }}</td>
                </tr>
                <tr>
                  <th>{{ t('sku.colCategory') }}</th>
                  <td>
                    <span v-if="detail.sku.category" class="sku-tag">{{ detail.sku.category }}</span>
                    <span v-else>—</span>
                  </td>
                  <th>{{ t('sku.colImages') }}</th>
                  <td>{{ detail.images.length }} / {{ SKU_IMAGE_LIMIT }}</td>
                </tr>
                <tr>
                  <th>{{ t('sku.dims') }}</th>
                  <td class="mono">{{ formatDims(detail.sku) }}</td>
                  <th>{{ t('sku.netWeight') }}</th>
                  <td class="mono">{{ formatKg(detail.sku.netWeightKg) }}</td>
                </tr>
                <tr>
                  <th>{{ t('sku.grossWeight') }}</th>
                  <td class="mono">{{ formatKg(detail.sku.grossWeightKg) }}</td>
                  <th>{{ t('sku.colUpdated') }}</th>
                  <td>{{ formatTime(detail.sku.updatedAt) }}</td>
                </tr>
                <tr>
                  <th>{{ t('sku.colNote') }}</th>
                  <td class="spec-note" colspan="3">{{ detail.sku.note || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="sec-hd">
            <h4>{{ t('sku.imagesTitle') }}</h4>
            <span class="chipx">{{ detail.images.length }} / {{ SKU_IMAGE_LIMIT }}</span>
            <div class="spacer" />
            <span v-if="unbindMode" class="sec-hint">{{ t('sku.unbindModeHint') }}</span>
            <button
              v-if="detail.images.length && !unbindMode"
              type="button"
              class="btn sm ghost"
              :disabled="store.isBusy"
              @click="enterUnbindMode"
            >
              {{ t('sku.unbind') }}
            </button>
            <button
              v-else-if="unbindMode"
              type="button"
              class="btn sm ghost"
              :disabled="store.isBusy"
              @click="exitUnbindMode"
            >
              {{ t('sku.cancel') }}
            </button>
            <button
              v-if="!unbindMode"
              type="button"
              class="btn sm"
              :class="{ primary: showPicker || !detail.images.length }"
              :disabled="store.isBusy || !canAddMoreImages"
              :title="
                canAddMoreImages ? undefined : t('sku.imageLimitReached', { limit: SKU_IMAGE_LIMIT })
              "
              @click="togglePicker"
            >
              <UiIcon name="plus" :size="14" />
              {{ t('sku.addImages') }}
            </button>
          </div>

          <div v-if="!detail.images.length" class="img-empty" style="margin-top: 4px">
            {{ t('sku.noImages') }}
          </div>
          <div v-else class="img-grid">
            <button
              v-for="img in detail.images"
              :key="img.id"
              type="button"
              class="img-tile bound-tile"
              :class="{
                cover: img.isCover,
                on: unbindMode && store.boundSelected.includes(img.id),
                selectable: unbindMode
              }"
              :title="img.relativePath"
              @click="unbindMode ? store.toggleBoundSelected(img.id) : undefined"
            >
              <img :src="img.publicUrl" :alt="fileName(img.relativePath)" loading="lazy" />
              <span v-if="img.isCover" class="cover-badge">{{ t('sku.cover') }}</span>
              <span v-if="unbindMode" class="pick-check">
                <UiIcon name="check" :size="11" />
              </span>
              <div v-if="!unbindMode" class="tile-actions" @click.stop>
                <button
                  v-if="!img.isCover"
                  type="button"
                  class="tile-btn"
                  :disabled="store.isBusy"
                  :title="t('sku.setCover')"
                  @click="store.setCover(img.id)"
                >
                  <UiIcon name="star" :size="13" />
                </button>
              </div>
            </button>
          </div>

          <section v-if="showPicker" ref="pickerEl" class="picker">
            <div class="sec-hd">
              <h4>{{ t('sku.pickerTitle') }}</h4>
              <span class="sec-hint">{{ t('sku.pickerDirHint') }}</span>
              <div class="spacer" />
              <button
                type="button"
                class="btn sm ghost"
                :disabled="store.pickerLoading || !pickerCandidates.length"
                @click="toggleSelectAllPicker"
              >
                {{ pickerAllSelected ? t('sku.deselectAll') : t('sku.selectAll') }}
              </button>
            </div>
            <div class="explorer sku-picker-ex">
              <div class="ex-bar">
                <div class="ex-nav">
                  <button
                    type="button"
                    :disabled="!store.pickerCanGoBack"
                    :title="t('library.goBack')"
                    @click="store.pickerGoBack()"
                  >
                    <UiIcon name="arrowLeft" :size="14" />
                  </button>
                  <button
                    type="button"
                    :disabled="!store.pickerPathPrefix"
                    :title="t('library.goUp')"
                    @click="store.pickerGoUp()"
                  >
                    <UiIcon name="arrowUp" :size="14" />
                  </button>
                </div>
                <div class="crumb">
                  <template v-for="(crumb, index) in pickerCrumbs" :key="`${crumb.path}-${index}`">
                    <span v-if="index > 0" class="sep">›</span>
                    <button
                      type="button"
                      :class="{ cur: index === pickerCrumbs.length - 1 }"
                      @click="store.openPickerFolder(crumb.path)"
                    >
                      {{ crumb.label }}
                    </button>
                  </template>
                </div>
                <div class="ex-filter">
                  <UiIcon name="search" :size="13" />
                  <input
                    v-model="store.pickerSearch"
                    class="input"
                    type="search"
                    :placeholder="t('library.searchInFolder')"
                  />
                </div>
              </div>
              <div v-if="store.pickerLoading" class="img-empty" style="margin: 12px">
                {{ t('sku.pickerLoading') }}
              </div>
              <div v-else-if="pickerIsEmpty" class="img-empty" style="margin: 12px">
                {{
                  store.pickerPathPrefix || store.pickerSearch.trim()
                    ? t('library.emptyFolder')
                    : t('sku.pickerEmpty')
                }}
              </div>
              <div v-else class="ex-gallery-scroll scroll">
                <div class="ex-gallery sku-picker-gallery">
                  <button
                    v-for="folder in pickerFolders"
                    :key="`pf-${folder.path}`"
                    type="button"
                    class="ex-folder-card"
                    :title="t('sku.folderOpenTip')"
                    @click="store.openPickerFolder(folder.path)"
                    @keydown.enter.prevent="store.openPickerFolder(folder.path)"
                  >
                    <div class="ex-folder-icon">
                      <UiIcon name="folder" :size="28" />
                    </div>
                    <div class="ex-card-name" :title="folder.name">{{ folder.name }}</div>
                    <div class="ex-card-sub">
                      {{ folder.fileCount }} {{ t('library.itemsUnit') }}
                    </div>
                  </button>
                  <button
                    v-for="file in pickerCandidates"
                    :key="file.id"
                    type="button"
                    class="ex-image-card pick-card"
                    :class="{ on: store.pickerSelected.includes(file.id) }"
                    :title="file.relativePath"
                    @click="store.togglePicker(file.id)"
                  >
                    <div class="ex-image">
                      <img
                        v-if="file.publicUrl"
                        :src="file.publicUrl"
                        :alt="fileName(file.relativePath)"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      />
                      <div v-else class="ex-image-placeholder">
                        <UiIcon name="image" :size="24" />
                      </div>
                      <span class="pick-check"><UiIcon name="check" :size="11" /></span>
                    </div>
                    <div class="ex-card-meta">
                      <div class="ex-card-name" :title="fileName(file.relativePath)">
                        {{ fileName(file.relativePath) }}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
              <div
                v-if="store.pickerPageCount > 1"
                class="picker-page"
              >
                <button
                  type="button"
                  class="btn sm ghost"
                  :disabled="!store.pickerCanPrev || store.pickerLoading"
                  @click="store.pickerPrevPage()"
                >
                  {{ t('sku.prevPage') }}
                </button>
                <span class="muted">
                  {{ t('sku.pageOf', { page: store.pickerPage, pages: store.pickerPageCount }) }}
                </span>
                <button
                  type="button"
                  class="btn sm"
                  :disabled="!store.pickerCanNext || store.pickerLoading"
                  @click="store.pickerNextPage()"
                >
                  {{ t('sku.nextPage') }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div v-if="showPicker" class="drawer-ft picker-bar">
          <span class="sel-count">{{ t('sku.selectedN', { n: store.pickerSelected.length }) }}</span>
          <button
            v-if="store.pickerHasSelection"
            type="button"
            class="btn sm ghost"
            @click="store.clearPickerSelection()"
          >
            {{ t('sku.clearSelection') }}
          </button>
          <div class="spacer" />
          <button type="button" class="btn sm ghost" @click="showPicker = false">
            {{ t('sku.cancel') }}
          </button>
          <button
            type="button"
            class="btn sm primary"
            :disabled="store.isBusy || !store.pickerHasSelection"
            @click="confirmBindSelected"
          >
            {{ t('sku.bindSelected', { n: store.pickerSelected.length }) }}
          </button>
        </div>
        <div
          v-else-if="unbindMode"
          class="drawer-ft picker-bar"
        >
          <span class="sel-count">{{ t('sku.selectedN', { n: store.boundSelected.length }) }}</span>
          <button
            v-if="store.boundSelected.length"
            type="button"
            class="btn sm ghost"
            @click="store.clearBoundSelected()"
          >
            {{ t('sku.clearSelection') }}
          </button>
          <div class="spacer" />
          <button type="button" class="btn sm ghost" @click="exitUnbindMode">
            {{ t('sku.cancel') }}
          </button>
          <button
            type="button"
            class="btn sm danger"
            :disabled="store.isBusy || !store.boundSelected.length"
            @click="confirmUnbindSelected"
          >
            {{ t('sku.unbindSelected', { n: store.boundSelected.length }) }}
          </button>
        </div>
      </template>
    </aside>

    <!-- Create / edit modal -->
    <div class="scrim" :class="{ show: dialogOpen }" style="z-index: 110" @click="closeDialog" />
    <div
      class="modal"
      :class="{ show: dialogOpen }"
      style="z-index: 120"
      role="dialog"
      aria-modal="true"
      :aria-label="isEditing ? t('sku.editTitle') : t('sku.addTitle')"
      tabindex="-1"
      @click.stop
    >
      <div class="modal-hd">
        <UiIcon name="tag" :size="15" />
        <h3>{{ isEditing ? t('sku.editTitle') : t('sku.addTitle') }}</h3>
        <div class="spacer" />
        <button
          type="button"
          class="btn icon sm ghost"
          :disabled="store.isBusy"
          :aria-label="t('sku.close')"
          @click="closeDialog"
        >
          <UiIcon name="x" :size="14" />
        </button>
      </div>
      <div class="modal-bd">
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.colSku') }}</b></div>
          <input
            v-model="form.sku"
            class="input mono"
            type="text"
            maxlength="64"
            :placeholder="t('sku.skuPlaceholder')"
            :disabled="store.isBusy"
          />
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.colName') }}</b></div>
          <input
            v-model="form.name"
            class="input"
            type="text"
            maxlength="128"
            :placeholder="t('sku.namePlaceholder')"
            :disabled="store.isBusy"
          />
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.colBrand') }}</b></div>
          <input
            v-model="form.brand"
            class="input"
            type="text"
            maxlength="64"
            :placeholder="t('sku.brandPlaceholder')"
            :disabled="store.isBusy"
          />
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.colCategory') }}</b></div>
          <input
            v-model="form.category"
            class="input"
            type="text"
            maxlength="64"
            :placeholder="t('sku.categoryPlaceholder')"
            :disabled="store.isBusy"
          />
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.colBarcode') }}</b></div>
          <input
            v-model="form.barcode"
            class="input mono"
            type="text"
            maxlength="64"
            :placeholder="t('sku.barcodePlaceholder')"
            :disabled="store.isBusy"
          />
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.dims') }}</b></div>
          <div class="measure-row">
            <label class="measure-field">
              <span>{{ t('sku.length') }}</span>
              <input
                v-model="form.lengthCm"
                class="input mono"
                type="number"
                min="0"
                step="0.1"
                inputmode="decimal"
                :placeholder="t('sku.cmUnit')"
                :disabled="store.isBusy"
              />
            </label>
            <label class="measure-field">
              <span>{{ t('sku.width') }}</span>
              <input
                v-model="form.widthCm"
                class="input mono"
                type="number"
                min="0"
                step="0.1"
                inputmode="decimal"
                :placeholder="t('sku.cmUnit')"
                :disabled="store.isBusy"
              />
            </label>
            <label class="measure-field">
              <span>{{ t('sku.height') }}</span>
              <input
                v-model="form.heightCm"
                class="input mono"
                type="number"
                min="0"
                step="0.1"
                inputmode="decimal"
                :placeholder="t('sku.cmUnit')"
                :disabled="store.isBusy"
              />
            </label>
          </div>
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.weight') }}</b></div>
          <div class="measure-row">
            <label class="measure-field">
              <span>{{ t('sku.grossWeight') }}</span>
              <input
                v-model="form.grossWeightKg"
                class="input mono"
                type="number"
                min="0"
                step="0.001"
                inputmode="decimal"
                :placeholder="t('sku.kgUnit')"
                :disabled="store.isBusy"
              />
            </label>
            <label class="measure-field">
              <span>{{ t('sku.netWeight') }}</span>
              <input
                v-model="form.netWeightKg"
                class="input mono"
                type="number"
                min="0"
                step="0.001"
                inputmode="decimal"
                :placeholder="t('sku.kgUnit')"
                :disabled="store.isBusy"
              />
            </label>
          </div>
        </div>
        <div class="form-row">
          <div class="lbl"><b>{{ t('sku.colNote') }}</b></div>
          <textarea
            v-model="form.note"
            class="input"
            rows="3"
            maxlength="500"
            :placeholder="t('sku.notePlaceholder')"
            :disabled="store.isBusy"
          />
        </div>
        <p v-if="formError" class="err">{{ formError }}</p>
      </div>
      <div class="modal-ft">
        <div class="spacer" />
        <button type="button" class="btn" :disabled="store.isBusy" @click="closeDialog">
          {{ t('sku.cancel') }}
        </button>
        <button type="button" class="btn primary" :disabled="store.isBusy" @click="submitForm">
          {{ isEditing ? t('sku.save') : t('sku.add') }}
        </button>
      </div>
    </div>

    <SkuImportDialog :open="importOpen" @close="closeImport" />
  </div>
</template>

<style scoped>
.modal .form-row {
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 0;
}

.measure-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.measure-row:has(.measure-field:nth-child(2):last-child) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 280px;
}

.measure-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.measure-field .input {
  width: 100%;
}

.err {
  margin: 8px 0 0;
  color: var(--err);
  font-size: 12.5px;
}

.list-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding: 0 10px;
  height: 32px;
  min-width: 220px;
  max-width: 320px;
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-3);
}

.list-search .input {
  border: 0;
  box-shadow: none;
  height: 30px;
  padding: 0;
  background: transparent;
}

.list-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--text-2);
}

.page-ind {
  margin-right: 4px;
}

.sku-row {
  cursor: pointer;
}

.cover-cell {
  display: flex;
  align-items: center;
}

.cover-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.cover-thumb.ph {
  display: grid;
  place-items: center;
  color: var(--text-3);
}

.col-no { width: 48px; }
.col-cover { width: 64px; }
.col-cat { width: 96px; }
.col-measure { width: 168px; }
.col-images { width: 56px; }
.col-time { width: 148px; }
.col-ops { width: 148px; }

.cell-main {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--text);
  line-height: 1.35;
}

.sku-code {
  font-weight: 600;
}

.cell-sub {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-ico {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.link-ico:hover {
  color: var(--brand);
  background: var(--brand-50);
}

.sku-tag {
  display: inline-block;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 4px;
  background: #e8f3ff;
  color: #1677ff;
  font-size: 12px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.op-links {
  display: flex;
  align-items: center;
  gap: 10px;
}

.op-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 13px;
  cursor: pointer;
}

.op-link:hover {
  text-decoration: underline;
}

.op-link.danger {
  color: var(--err);
}

.op-link:disabled {
  opacity: 0.45;
  cursor: default;
  text-decoration: none;
}

.sku-detail.drawer {
  width: min(860px, 94vw);
}

.hd-text {
  min-width: 0;
}

.hd-text h3 {
  margin: 0;
}

.hd-sub {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spec {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.spec-cover {
  height: 112px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  overflow: hidden;
}

.spec-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #fff;
}

.spec-cover-ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-3);
}

.spec-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12.5px;
}

.spec-table th,
.spec-table td {
  border: 1px solid var(--line);
  padding: 8px 10px;
  text-align: left;
  vertical-align: middle;
}

.spec-table th {
  width: 72px;
  background: var(--surface-2);
  color: var(--text-3);
  font-weight: 500;
  white-space: nowrap;
}

.spec-table td {
  color: var(--text);
  word-break: break-word;
}

.spec-note {
  white-space: pre-wrap;
}

.spec + .sec-hd {
  margin-top: 18px;
}

.sec-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.sec-hd h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 640;
}

.sec-hint {
  font-size: 11.5px;
  color: var(--text-3);
}

.img-empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
  border: 1px dashed var(--line-2);
  border-radius: 10px;
}

.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px;
}

.img-tile {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-2);
  padding: 0;
}

.img-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.img-tile.cover {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.sku-bound-ex {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
  min-height: 180px;
}

.sku-bound-ex .ex-gallery-scroll {
  max-height: min(42vh, 440px);
}

.bound-tile.selectable {
  cursor: pointer;
}

.bound-tile.cover {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.bound-tile.on {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand);
}

.bound-tile .ex-image {
  position: relative;
  aspect-ratio: 1;
}

.bound-tile .ex-image > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bound-tile .pick-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1.5px solid #fff;
  background: rgba(15, 23, 42, 0.35);
  color: transparent;
  z-index: 2;
}

.bound-tile.on .pick-check {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.bound-add-tile {
  aspect-ratio: 1;
  min-height: 120px;
}

.cover-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 650;
  color: #fff;
  background: var(--brand);
}

.tile-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 120ms ease;
}

.img-tile:hover .tile-actions,
.img-tile:focus-within .tile-actions {
  opacity: 1;
}

.tile-btn {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  cursor: pointer;
}

.tile-btn:hover {
  background: var(--brand);
}

.tile-btn.danger:hover {
  background: var(--err);
}

.add-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-style: dashed;
  border-color: var(--line-2);
  background: transparent;
  color: var(--text-3);
  font-size: 11.5px;
  cursor: pointer;
}

.add-tile:hover,
.add-tile.on {
  border-color: var(--brand);
  color: var(--brand);
}

.picker {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.sku-picker-ex {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
  max-height: min(52vh, 520px);
}

.sku-picker-ex .ex-gallery-scroll {
  max-height: min(40vh, 400px);
}

.sku-picker-gallery {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  padding: 10px;
}

.sku-picker-gallery .ex-folder-icon {
  height: 64px;
}

.pick-card,
.pick-folder {
  text-align: left;
  padding: 0;
  font: inherit;
  color: inherit;
}

.pick-folder.on {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px rgba(27, 110, 243, 0.12);
}

.pick-folder .ex-folder-icon {
  position: relative;
}

.pick-folder .pick-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1.5px solid #fff;
  background: rgba(15, 23, 42, 0.35);
  color: transparent;
  z-index: 2;
}

.pick-folder.on .pick-check {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.pick-card .ex-image {
  aspect-ratio: 1;
}

.pick-card .ex-image > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pick-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1.5px solid #fff;
  background: rgba(15, 23, 42, 0.35);
  color: transparent;
  z-index: 2;
}

.pick-card.on .pick-check {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.picker-page {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}

.picker-bar {
  align-items: center;
  background: var(--surface);
}

.picker-bar .spacer {
  flex: 1;
}

.sel-count {
  font-size: 12.5px;
  color: var(--text-2);
}
</style>