<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
          <div class="meta-block">
            <div class="meta-row">
              <span class="k">{{ t('sku.colNote') }}</span>
              <span class="v">{{ detail.sku.note || '—' }}</span>
            </div>
            <div class="meta-row">
              <span class="k">{{ t('sku.colUpdated') }}</span>
              <span class="v">{{ formatTime(detail.sku.updatedAt) }}</span>
            </div>
            <div class="meta-row">
              <span class="k">{{ t('sku.colImages') }}</span>
              <span class="v">{{ detail.images.length }} / {{ SKU_IMAGE_LIMIT }}</span>
            </div>
          </div>

          <div class="sec-hd">
            <h4>{{ t('sku.imagesTitle') }}</h4>
            <div class="spacer" />
            <button
              type="button"
              class="btn sm"
              :disabled="store.isBusy || detail.images.length >= SKU_IMAGE_LIMIT"
              @click="showPicker = !showPicker"
            >
              <UiIcon name="plus" :size="13" />
              {{ t('sku.addImages') }}
            </button>
          </div>

          <div v-if="!detail.images.length" class="img-empty">
            {{ t('sku.noImages') }}
          </div>
          <div v-else class="img-grid">
            <div
              v-for="img in detail.images"
              :key="img.id"
              class="img-card"
              :class="{ cover: img.isCover }"
            >
              <img :src="img.publicUrl" :alt="fileName(img.relativePath)" loading="lazy" />
              <span v-if="img.isCover" class="cover-badge">{{ t('sku.cover') }}</span>
              <div class="img-actions">
                <button
                  v-if="!img.isCover"
                  type="button"
                  class="btn sm"
                  :disabled="store.isBusy"
                  @click="store.setCover(img.id)"
                >
                  {{ t('sku.setCover') }}
                </button>
                <button
                  type="button"
                  class="btn sm ghost"
                  :disabled="store.isBusy"
                  @click="confirmUnbind(img.id, img.relativePath)"
                >
                  {{ t('sku.unbind') }}
                </button>
              </div>
              <div class="img-name" :title="img.relativePath">{{ fileName(img.relativePath) }}</div>
            </div>
          </div>

          <div v-if="showPicker" class="picker">
            <div class="sec-hd" style="margin-top: 18px">
              <h4>{{ t('sku.pickerTitle') }}</h4>
              <div class="spacer" />
              <span class="chipx">{{ store.pickerSelected.length }}</span>
            </div>
            <div class="picker-search">
              <UiIcon name="search" :size="13" />
              <input
                v-model="store.pickerSearch"
                class="input"
                type="search"
                :placeholder="t('sku.pickerSearch')"
              />
            </div>
            <div v-if="store.pickerLoading" class="img-empty">{{ t('sku.pickerLoading') }}</div>
            <div v-else-if="!pickerCandidates.length" class="img-empty">
              {{ t('sku.pickerEmpty') }}
            </div>
            <div v-else class="picker-list scroll">
              <button
                v-for="file in pickerCandidates"
                :key="file.id"
                type="button"
                class="picker-item"
                :class="{ on: store.pickerSelected.includes(file.id) }"
                @click="store.togglePicker(file.id)"
              >
                <img
                  v-if="file.publicUrl"
                  :src="file.publicUrl"
                  :alt="fileName(file.relativePath)"
                  class="picker-thumb"
                />
                <div v-else class="picker-thumb ph"><UiIcon name="image" :size="12" /></div>
                <div class="picker-meta">
                  <div class="nm">{{ fileName(file.relativePath) }}</div>
                  <div class="path">{{ file.relativePath }}</div>
                </div>
                <UiIcon
                  v-if="store.pickerSelected.includes(file.id)"
                  name="check"
                  :size="14"
                  class="chk"
                />
              </button>
            </div>
            <div class="picker-ft">
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
          </div>
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
  width: min(480px, 100vw);
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

.meta-block {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.meta-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  font-size: 12.5px;
}

.meta-row .k {
  color: var(--text-3);
}

.meta-row .v {
  color: var(--text);
  word-break: break-word;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.img-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-2);
}

.img-card.cover {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand) 35%, transparent);
}

.img-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
  background: #0f172a08;
}

.cover-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 650;
  color: #fff;
  background: var(--brand);
}

.img-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px 0;
}

.img-name {
  padding: 6px 8px 8px;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker {
  margin-top: 4px;
}

.picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 10px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-3);
}

.picker-search .input {
  border: 0;
  box-shadow: none;
  height: 32px;
  padding: 0;
  background: transparent;
}

.picker-list {
  max-height: 240px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 6px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.picker-item:hover,
.picker-item.on {
  background: var(--surface-2);
}

.picker-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--line);
  flex: none;
}

.picker-thumb.ph {
  display: grid;
  place-items: center;
  background: var(--surface-2);
  color: var(--text-3);
}

.picker-meta {
  min-width: 0;
  flex: 1;
}

.picker-meta .nm {
  font-size: 12.5px;
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-meta .path {
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-item .chk {
  color: var(--brand);
  flex: none;
}

.picker-ft {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
