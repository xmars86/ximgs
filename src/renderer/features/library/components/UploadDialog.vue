<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGalleryStore } from '../useGalleryStore'
import UiIcon from '../../../shared/ui/UiIcon.vue'
import { toast } from '../../../shared/ui/useToast'

interface PendingFile {
  path: string
  name: string
  size: number | null
  pct: number
  done: boolean
}

const { t } = useI18n()
const gallery = useGalleryStore()
const isDragOver = ref(false)
const pending = ref<PendingFile[]>([])
const pathInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const MEDIA_EXT = /\.(jpe?g|png|gif|bmp|webp|mp4|mov|m4v|webm|avi)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi)$/i
const IMAGE_MAX_BYTES = 20 * 1024 * 1024
const VIDEO_MAX_BYTES = 500 * 1024 * 1024

const pathPreview = computed(() => {
  const folder = gallery.uploadFolder.trim().replace(/^\/+|\/+$/g, '')
  if (folder) return `${folder}/`
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `images/${y}/${m}/`
})

const canStart = computed(() => pending.value.length > 0 && !gallery.isUploading)

watch(
  () => gallery.showUploadDialog,
  (open) => {
    if (open) {
      pending.value = []
      isDragOver.value = false
      window.addEventListener('paste', onWindowPaste)
      setTimeout(() => pathInput.value?.focus(), 120)
    } else {
      window.removeEventListener('paste', onWindowPaste)
      pending.value = []
      isDragOver.value = false
    }
  }
)

onMounted(() => {
  if (gallery.showUploadDialog) {
    window.addEventListener('paste', onWindowPaste)
  }
})

onUnmounted(() => {
  window.removeEventListener('paste', onWindowPaste)
})

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function maxBytesForPath(path: string): number {
  return VIDEO_EXT.test(path) ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
}

function addPaths(entries: { path: string; size?: number | null }[]): void {
  const existing = new Set(pending.value.map((p) => p.path))
  let skippedOversize = 0
  for (const entry of entries) {
    const path = entry.path.trim()
    if (!path || existing.has(path)) continue
    if (!MEDIA_EXT.test(path)) continue
    const size = entry.size ?? null
    if (size != null && size > maxBytesForPath(path)) {
      skippedOversize += 1
      continue
    }
    existing.add(path)
    pending.value.push({
      path,
      name: fileNameFromPath(path),
      size,
      pct: 0,
      done: false
    })
  }
  if (skippedOversize) {
    toast.info(t('library.uploadOversize', { n: skippedOversize }))
  }
}

function pathsFromFileList(files: FileList | File[]): { path: string; size: number }[] {
  return Array.from(files)
    .filter((file) => MEDIA_EXT.test(file.name))
    .map((file) => {
      try {
        return { path: window.ximgs.getPathForFile(file), size: file.size }
      } catch {
        return { path: '', size: 0 }
      }
    })
    .filter((x) => Boolean(x.path))
}

async function onWindowPaste(event: ClipboardEvent): Promise<void> {
  if (!gallery.showUploadDialog || gallery.isUploading) return
  const files = event.clipboardData?.files
  if (files?.length) {
    const entries = pathsFromFileList(files)
    if (entries.length) {
      event.preventDefault()
      addPaths(entries)
      return
    }
  }
  // Bitmap paste (no File.path) → upload via main process
  event.preventDefault()
  await gallery.uploadClipboard()
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  if (!gallery.isUploading) isDragOver.value = true
}

function onDragLeave(): void {
  isDragOver.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  isDragOver.value = false
  if (gallery.isUploading) return
  const files = event.dataTransfer?.files
  if (!files?.length) return
  const entries = pathsFromFileList(files)
  if (!entries.length) {
    toast.err(t('library.uploadNeedLocalPath'))
    return
  }
  addPaths(entries)
}

function pickFiles(): void {
  if (gallery.isUploading) return
  gallery.errorMessage = null
  fileInput.value?.click()
}

function onFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  const entries = pathsFromFileList(files)
  input.value = ''
  if (!entries.length) {
    toast.err(t('library.uploadNeedLocalPath'))
    return
  }
  gallery.errorMessage = null
  addPaths(entries)
}

function useAutoPath(): void {
  gallery.uploadFolder = ''
}

function useCurrentFolder(): void {
  gallery.useCurrentFolderForUpload()
}

function removePending(index: number): void {
  if (gallery.isUploading) return
  pending.value.splice(index, 1)
}

async function startUpload(): Promise<void> {
  if (!canStart.value) return
  const paths = pending.value.map((p) => p.path)
  for (const item of pending.value) {
    item.pct = 15
    item.done = false
  }
  const timer = setInterval(() => {
    for (const item of pending.value) {
      if (!item.done && item.pct < 90) item.pct = Math.min(90, item.pct + 8)
    }
  }, 180)
  try {
    await gallery.uploadLocalPaths(paths)
    for (const item of pending.value) {
      item.pct = 100
      item.done = true
    }
  } finally {
    clearInterval(timer)
  }
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !gallery.isUploading) {
    gallery.closeUploadDialog()
  }
}
</script>

<template>
  <div
    class="scrim"
    :class="{ show: gallery.showUploadDialog }"
    @click="!gallery.isUploading && gallery.closeUploadDialog()"
  />
  <div
    class="modal upload-modal"
    :class="{ show: gallery.showUploadDialog }"
    role="dialog"
    aria-modal="true"
    :aria-label="t('library.uploadDialogTitle')"
    tabindex="-1"
    @keydown="onDialogKeydown"
    @click.stop
  >
    <div class="modal-hd">
      <UiIcon name="upload" :size="15" class="hd-ico" />
      <h3>{{ t('library.uploadDialogTitle') }}</h3>
      <div class="spacer" />
      <button
        type="button"
        class="btn icon sm ghost"
        :disabled="gallery.isUploading"
        :aria-label="t('library.close')"
        @click="gallery.closeUploadDialog()"
      >
        <UiIcon name="x" :size="14" />
      </button>
    </div>

    <div class="modal-bd">
      <p class="hint top-hint">{{ t('library.uploadDialogHint') }}</p>

      <div class="path-block">
        <div class="lbl"><b>{{ t('library.uploadPath') }}</b></div>
        <input
          ref="pathInput"
          v-model="gallery.uploadFolder"
          class="input"
          type="text"
          :placeholder="t('library.uploadPathPlaceholder')"
          :disabled="gallery.isUploading"
        />
        <div class="path-chips">
          <button
            type="button"
            class="btn sm"
            :disabled="gallery.isUploading"
            @click="useAutoPath"
          >
            {{ t('library.uploadPathAuto') }}
          </button>
          <button
            type="button"
            class="btn sm"
            :disabled="gallery.isUploading || !gallery.pathPrefix"
            :title="t('library.useCurrentFolderHint')"
            @click="useCurrentFolder"
          >
            {{ t('library.useCurrentFolder') }}
          </button>
        </div>
        <div class="tip">
          {{ t('library.uploadPathPreview', { path: pathPreview }) }}
        </div>
      </div>

      <div
        class="drop"
        :class="{ hot: isDragOver, disabled: gallery.isUploading }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <span class="ic"><UiIcon name="upload" :size="16" /></span>
        <b>{{ t('library.dropTitle') }}</b>
        <p>{{ t('library.dropHint') }}</p>
        <div class="row">
          <button type="button" class="btn sm" :disabled="gallery.isUploading" @click="pickFiles">
            {{ t('library.pickFiles') }}
          </button>
          <button
            type="button"
            class="btn sm ghost"
            :disabled="gallery.isUploading"
            @click="gallery.uploadClipboard()"
          >
            {{ t('library.pasteClipboard') }}
          </button>
        </div>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/bmp,image/webp,video/mp4,video/quicktime,video/webm,video/x-msvideo,.jpg,.jpeg,.png,.gif,.bmp,.webp,.mp4,.mov,.m4v,.webm,.avi"
          multiple
          @change="onFileInputChange"
        />
      </div>

      <div v-if="pending.length" class="uplist">
        <div
          v-for="(item, index) in pending"
          :key="item.path"
          class="upitem"
          :class="{ done: item.done }"
        >
          <UiIcon name="image" :size="14" class="dim" />
          <span class="nm" :title="item.path">{{ item.name }}</span>
          <span class="sz">{{ formatBytes(item.size) }}</span>
          <span class="bar"><i :style="{ width: `${item.pct}%` }" /></span>
          <span v-if="item.done" class="ok"><UiIcon name="check" :size="13" /></span>
          <button
            v-else-if="!gallery.isUploading"
            type="button"
            class="btn icon sm ghost rm"
            :aria-label="t('library.close')"
            @click="removePending(index)"
          >
            <UiIcon name="x" :size="12" />
          </button>
        </div>
      </div>

      <p v-if="gallery.uploadProgress" class="progress">{{ gallery.uploadProgress }}</p>
      <p v-if="gallery.errorMessage && gallery.showUploadDialog" class="err">
        {{ gallery.errorMessage }}
      </p>
    </div>

    <div class="modal-ft">
      <span class="hint">{{ t('library.uploadLimitHint') }}</span>
      <div class="spacer" />
      <button
        type="button"
        class="btn"
        :disabled="gallery.isUploading"
        @click="gallery.closeUploadDialog()"
      >
        {{ t('library.uploadCancel') }}
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="!canStart"
        @click="startUpload"
      >
        {{
          gallery.isUploading
            ? t('library.uploading')
            : t('library.uploadCount', { n: pending.length })
        }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.upload-modal {
  z-index: 120;
}

.hd-ico {
  color: var(--brand);
  flex: none;
}

.top-hint {
  margin: 0 0 14px;
}

.path-block .lbl {
  margin-bottom: 6px;
  font-size: 12px;
}

.tip {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-3);
}

.tip :deep(.mono),
.tip {
  font-variant-numeric: tabular-nums;
}

.drop.disabled {
  opacity: 0.65;
  pointer-events: none;
}

.dim {
  color: var(--text-3);
  flex: none;
}

.rm {
  flex: none;
  padding: 2px 4px;
}

.progress {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.err {
  margin: 10px 0 0;
  font-size: 12px;
  color: #8a1f1f;
  white-space: pre-wrap;
}

.file-input {
  display: none;
}
</style>
