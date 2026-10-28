<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SkuDto } from '@shared/sku'
import { SKU_IMAGE_LIMIT, SKU_PAGE_SIZE } from '@shared/sku'
import UiIcon from '../../shared/ui/UiIcon.vue'
import { useSkuStore } from './useSkuStore'

const { t, locale } = useI18n()
const store = useSkuStore()

const dialogOpen = ref(false)
const editingId = ref<number | null>(null)
const formError = ref<string | null>(null)
const form = reactive({
  sku: '',
  name: '',
  note: ''
})

const searchQuery = ref('')
const page = ref(1)

const isEditing = computed(() => editingId.value != null)
const detail = computed(() => store.detail)
const showPicker = ref(false)
const pickerEl = ref<HTMLElement | null>(null)

const subtitleText = computed(() =>
  t('sku.subtitleStats', { n: store.count, limit: store.limit })
)

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return store.items
  return store.items.filter((row) => {
    const hay = `${row.sku} ${row.name} ${row.note ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
})

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

onMounted(() => {
  void store.refresh()
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

watch(
  () => store.pickerSearch,
  () => {
    if (!store.detailOpen) return
    void store.loadPicker()
  }
)

function prevPage(): void {
  if (canPrev.value) page.value -= 1
}

function nextPage(): void {
  if (canNext.value) page.value += 1
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale.value)
}

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function openCreate(): void {
  if (store.atLimit) return
  editingId.value = null
  form.sku = ''
  form.name = ''
  form.note = ''
  formError.value = null
  dialogOpen.value = true
}

function openEdit(row: SkuDto): void {
  editingId.value = row.id
  form.sku = row.sku
  form.name = row.name
  form.note = row.note ?? ''
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
  if (!sku) {
    formError.value = t('sku.errSkuRequired')
    return
  }
  if (!name) {
    formError.value = t('sku.errNameRequired')
    return
  }
  try {
    if (editingId.value != null) {
      await store.update({
        id: editingId.value,
        sku,
        name,
        note: note || null
      })
    } else {
      await store.create({
        sku,
        name,
        note: note || null
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
  await store.openDetail(row.id)
  showPicker.value = !store.detail?.images.length
}

async function togglePicker(): Promise<void> {
  showPicker.value = !showPicker.value
  if (!showPicker.value) return
  await nextTick()
  pickerEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function closeDetail(): void {
  showPicker.value = false
  store.closeDetail()
}

async function confirmUnbind(imageId: number, path: string): Promise<void> {
  if (!window.confirm(t('sku.unbindConfirm', { name: fileName(path) }))) return
  await store.unbindImage(imageId)
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (dialogOpen.value) closeDialog()
    else if (store.detailOpen) closeDetail()
  }
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
          <p>{{ t('sku.emptyHint', { limit: store.limit }) }}</p>
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
          <span class="chipx">{{ store.count }} / {{ store.limit }}</span>
        </div>
        <div v-if="!filteredItems.length" class="img-empty" style="margin: 16px">
          {{ t('sku.searchEmpty') }}
        </div>
        <template v-else>
          <div class="scroll" style="flex: 1; min-height: 0">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width: 64px">{{ t('sku.colCover') }}</th>
                  <th>{{ t('sku.colSku') }}</th>
                  <th>{{ t('sku.colName') }}</th>
                  <th style="width: 72px">{{ t('sku.colImages') }}</th>
                  <th>{{ t('sku.colNote') }}</th>
                  <th style="width: 148px">{{ t('sku.colUpdated') }}</th>
                  <th style="width: 190px">{{ t('sku.colActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedItems"
                  :key="row.id"
                  class="sku-row"
                  @click="openDetail(row)"
                >
                  <td>
                    <div class="cover-cell">
                      <img
                        v-if="row.coverUrl"
                        :src="row.coverUrl"
                        :alt="row.sku"
                        class="cover-thumb"
                      />
                      <div v-else class="cover-thumb ph">
                        <UiIcon name="image" :size="14" />
                      </div>
                    </div>
                  </td>
                  <td class="mono">{{ row.sku }}</td>
                  <td>{{ row.name }}</td>
                  <td class="muted">{{ row.imageCount }}</td>
                  <td class="muted">{{ row.note || '—' }}</td>
                  <td class="muted">{{ formatTime(row.updatedAt) }}</td>
                  <td @click.stop>
                    <div class="row" style="gap: 6px">
                      <button
                        type="button"
                        class="btn sm ghost"
                        :disabled="store.isBusy"
                        @click="openDetail(row)"
                      >
                        {{ t('sku.detail') }}
                      </button>
                      <button
                        type="button"
                        class="btn sm ghost"
                        :disabled="store.isBusy"
                        @click="openEdit(row)"
                      >
                        {{ t('sku.edit') }}
                      </button>
                      <button
                        type="button"
                        class="btn sm ghost"
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
      class="drawer sku-drawer"
      :class="{ show: store.detailOpen }"
      role="dialog"
      aria-modal="true"
    >
      <template v-if="detail">
        <div class="drawer-hd">
          <UiIcon name="tag" :size="15" />
          <div class="hd-text">
            <h3>{{ detail.sku.sku }}</h3>
            <div class="hd-sub">{{ detail.sku.name }}</div>
          </div>
          <div class="spacer" />
          <button type="button" class="btn sm ghost" :disabled="store.isBusy" @click="editFromDetail">
            {{ t('sku.edit') }}
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
          <div class="meta-line">
            <span class="meta-chip">
              <span class="k">{{ t('sku.colNote') }}</span>
              <span class="v" :title="detail.sku.note || ''">{{ detail.sku.note || '—' }}</span>
            </span>
            <span class="meta-chip">
              <span class="k">{{ t('sku.colUpdated') }}</span>
              <span class="v">{{ formatTime(detail.sku.updatedAt) }}</span>
            </span>
          </div>

          <div class="sec-hd">
            <h4>{{ t('sku.imagesTitle') }}</h4>
            <span class="chipx">{{ detail.images.length }} / {{ SKU_IMAGE_LIMIT }}</span>
            <div class="spacer" />
            <span v-if="detail.images.length" class="sec-hint">{{ t('sku.hoverHint') }}</span>
          </div>

          <div class="img-grid">
            <div
              v-for="img in detail.images"
              :key="img.id"
              class="img-tile"
              :class="{ cover: img.isCover }"
              :title="img.relativePath"
            >
              <img :src="img.publicUrl" :alt="fileName(img.relativePath)" loading="lazy" />
              <span v-if="img.isCover" class="cover-badge">{{ t('sku.cover') }}</span>
              <div class="tile-actions">
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
                <button
                  type="button"
                  class="tile-btn danger"
                  :disabled="store.isBusy"
                  :title="t('sku.unbind')"
                  @click="confirmUnbind(img.id, img.relativePath)"
                >
                  <UiIcon name="x" :size="13" />
                </button>
              </div>
            </div>
            <button
              v-if="detail.images.length < SKU_IMAGE_LIMIT"
              type="button"
              class="img-tile add-tile"
              :class="{ on: showPicker }"
              :disabled="store.isBusy"
              @click="togglePicker"
            >
              <UiIcon name="plus" :size="18" />
              <span>{{ t('sku.addImages') }}</span>
            </button>
          </div>
          <p v-if="!detail.images.length" class="sec-hint" style="margin: 8px 0 0">
            {{ t('sku.noImages') }}
          </p>

          <section v-if="showPicker" ref="pickerEl" class="picker">
            <div class="sec-hd">
              <h4>{{ t('sku.pickerTitle') }}</h4>
              <div class="spacer" />
              <div class="picker-search">
                <UiIcon name="search" :size="13" />
                <input
                  v-model="store.pickerSearch"
                  class="input"
                  type="search"
                  :placeholder="t('sku.pickerSearch')"
                />
              </div>
            </div>
            <div v-if="store.pickerLoading" class="img-empty">{{ t('sku.pickerLoading') }}</div>
            <div v-else-if="!pickerCandidates.length" class="img-empty">
              {{ t('sku.pickerEmpty') }}
            </div>
            <div v-else class="img-grid picker-grid">
              <button
                v-for="file in pickerCandidates"
                :key="file.id"
                type="button"
                class="img-tile pick-tile"
                :class="{ on: store.pickerSelected.includes(file.id) }"
                :title="file.relativePath"
                @click="store.togglePicker(file.id)"
              >
                <img
                  v-if="file.publicUrl"
                  :src="file.publicUrl"
                  :alt="fileName(file.relativePath)"
                  loading="lazy"
                />
                <span class="pick-check"><UiIcon name="check" :size="11" /></span>
                <span class="pick-name">{{ fileName(file.relativePath) }}</span>
              </button>
            </div>
          </section>
        </div>

        <div v-if="showPicker" class="drawer-ft picker-bar">
          <span class="sel-count">{{ t('sku.selectedN', { n: store.pickerSelected.length }) }}</span>
          <button
            v-if="store.pickerSelected.length"
            type="button"
            class="btn sm ghost"
            @click="store.pickerSelected = []"
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
            :disabled="store.isBusy || !store.pickerSelected.length"
            @click="store.bindSelected()"
          >
            {{ t('sku.bindSelected', { n: store.pickerSelected.length }) }}
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
  </div>
</template>

<style scoped>
.modal .form-row {
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 0;
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
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.cover-thumb.ph {
  display: grid;
  place-items: center;
  color: var(--text-3);
}

.sku-drawer {
  width: min(720px, 92vw);
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

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 14px;
  font-size: 12px;
}

.meta-chip {
  display: inline-flex;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.meta-chip .k {
  color: var(--text-3);
  flex: none;
}

.meta-chip .v {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.picker-search {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 240px;
  padding: 0 10px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-3);
}

.picker-search .input {
  border: 0;
  box-shadow: none;
  height: 28px;
  padding: 0;
  background: transparent;
}

.pick-tile {
  cursor: pointer;
  color: inherit;
}

.pick-tile:hover {
  border-color: var(--line-2);
}

.pick-tile.on {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand);
}

.pick-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1.5px solid #fff;
  background: rgba(15, 23, 42, 0.35);
  color: transparent;
}

.pick-tile.on .pick-check {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.pick-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 6px 4px;
  font-size: 10.5px;
  color: #fff;
  text-align: left;
  background: linear-gradient(transparent, rgba(15, 23, 42, 0.75));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
