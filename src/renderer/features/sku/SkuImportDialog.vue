<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '../../shared/ui/UiIcon.vue'
import { toast } from '../../shared/ui/useToast'
import { useSkuStore } from './useSkuStore'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const store = useSkuStore()

const isDragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedPath = ref<string | null>(null)
const selectedName = ref<string | null>(null)

const canImport = computed(
  () => Boolean(selectedPath.value) && !store.isBusy
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedPath.value = null
      selectedName.value = null
      isDragOver.value = false
    }
  }
)

function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function setFileFromPath(path: string): void {
  const trimmed = path.trim()
  if (!trimmed) return
  if (!/\.csv$/i.test(trimmed)) {
    toast.err(t('sku.importOnlyCsv'))
    return
  }
  selectedPath.value = trimmed
  selectedName.value = fileNameFromPath(trimmed)
}

function pathFromFile(file: File): string {
  try {
    return window.ximgs.getPathForFile(file)
  } catch {
    return ''
  }
}

function onFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    const path = pathFromFile(file)
    if (!path) {
      toast.err(t('sku.importPathFailed'))
    } else {
      setFileFromPath(path)
    }
  }
  input.value = ''
}

function pickFile(): void {
  fileInput.value?.click()
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  if (store.isBusy) return
  isDragOver.value = true
}

function onDragLeave(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = false
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = false
  if (store.isBusy) return
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const path = pathFromFile(file)
  if (!path) {
    toast.err(t('sku.importPathFailed'))
    return
  }
  setFileFromPath(path)
}

function clearFile(): void {
  if (store.isBusy) return
  selectedPath.value = null
  selectedName.value = null
}

function close(): void {
  if (store.isBusy) return
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

async function onDownloadTemplate(): Promise<void> {
  const saved = await store.downloadImportTemplate()
  if (saved) toast.ok(t('sku.templateSaved'))
}

async function onImport(): Promise<void> {
  if (!selectedPath.value) return
  const res = await store.importCsv(selectedPath.value)
  if (!res) return
  toast.ok(
    t('sku.importDone', {
      created: res.created,
      updated: res.updated,
      failed: res.failed
    })
  )
  if (res.failed > 0 && res.errors[0]) {
    const first = res.errors[0]
    toast.err(
      t('sku.importFailHint', {
        row: first.row,
        sku: first.sku,
        message: first.message
      })
    )
  } else {
    emit('close')
  }
}
</script>

<template>
  <div class="scrim" :class="{ show: open }" style="z-index: 120" @click="close" />
  <div
    class="modal sku-import-modal"
    :class="{ show: open }"
    role="dialog"
    aria-modal="true"
    :aria-label="t('sku.batchImport')"
    tabindex="-1"
    @keydown="onKeydown"
    @click.stop
  >
    <div class="modal-hd">
      <UiIcon name="upload" :size="15" class="hd-ico" />
      <h3>{{ t('sku.batchImport') }}</h3>
      <div class="spacer" />
      <button
        type="button"
        class="btn icon sm ghost"
        :disabled="store.isBusy"
        :aria-label="t('sku.close')"
        @click="close"
      >
        <UiIcon name="x" :size="14" />
      </button>
    </div>

    <div class="modal-bd">
      <p class="hint top-hint">{{ t('sku.batchImportHint') }}</p>

      <div
        class="drop"
        :class="{ hot: isDragOver, disabled: store.isBusy }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @click="pickFile"
      >
        <span class="ic"><UiIcon name="upload" :size="16" /></span>
        <b>{{ t('sku.importDropTitle') }}</b>
        <p>{{ t('sku.importDropHint') }}</p>
        <div class="row" @click.stop>
          <button type="button" class="btn sm" :disabled="store.isBusy" @click="pickFile">
            {{ t('sku.importPickFile') }}
          </button>
        </div>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".csv,text/csv"
          @change="onFileInputChange"
        />
      </div>

      <div v-if="selectedName" class="picked">
        <UiIcon name="list" :size="14" class="dim" />
        <span class="nm" :title="selectedPath || undefined">{{ selectedName }}</span>
        <button
          type="button"
          class="btn icon sm ghost"
          :disabled="store.isBusy"
          :aria-label="t('sku.close')"
          @click="clearFile"
        >
          <UiIcon name="x" :size="12" />
        </button>
      </div>

      <div class="template-row">
        <div>
          <b>{{ t('sku.downloadTemplate') }}</b>
          <span class="tip">{{ t('sku.templateHint') }}</span>
        </div>
        <button
          type="button"
          class="btn sm"
          :disabled="store.isBusy"
          @click="onDownloadTemplate"
        >
          <UiIcon name="cloud" :size="14" />
          {{ t('sku.downloadTemplate') }}
        </button>
      </div>
    </div>

    <div class="modal-ft">
      <span class="hint">{{ t('sku.importUpsertHint') }}</span>
      <div class="spacer" />
      <button type="button" class="btn" :disabled="store.isBusy" @click="close">
        {{ t('sku.cancel') }}
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="!canImport"
        @click="onImport"
      >
        {{ store.isBusy ? t('sku.importing') : t('sku.importStart') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sku-import-modal {
  z-index: 121;
}

.hd-ico {
  color: var(--brand);
  flex: none;
}

.top-hint {
  margin: 0 0 14px;
}

.drop.disabled {
  opacity: 0.65;
  pointer-events: none;
}

.file-input {
  display: none;
}

.picked {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2, rgba(0, 0, 0, 0.03));
}

.picked .dim {
  color: var(--text-3);
  flex: none;
}

.picked .nm {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.template-row b {
  display: block;
  font-size: 12.5px;
}

.template-row .tip {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--text-3);
}
</style>
