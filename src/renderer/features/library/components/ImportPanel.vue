<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ASSET_TYPES } from '@shared/library'
import { bridgeInvoke } from '../../../shared/bridge/client'
import { useLibraryStore } from '../useLibraryStore'

const { t } = useI18n()
const library = useLibraryStore()

const storeId = ref<number | undefined>(undefined)
const asinOrSku = ref('')
const assetType = ref<string>('main')
const localError = ref<string | null>(null)
const isDragOver = ref(false)

const canImport = computed(
  () => Boolean(storeId.value) && Boolean(asinOrSku.value.trim()) && !library.isImporting
)

async function runImport(paths: string[]): Promise<void> {
  localError.value = null
  if (!storeId.value || !asinOrSku.value.trim()) {
    localError.value = t('library.importNeedMeta')
    return
  }
  if (!paths.length) return
  try {
    await library.importPaths({
      storeId: storeId.value,
      asinOrSku: asinOrSku.value.trim(),
      assetType: assetType.value,
      paths
    })
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error)
  }
}

async function pickFiles(): Promise<void> {
  const res = await bridgeInvoke('library.chooseImportFiles')
  await runImport(res.paths)
}

async function pickFolder(): Promise<void> {
  const res = await bridgeInvoke('library.chooseImportFolder')
  if (res.path) {
    await runImport([res.path])
  }
}

async function fromClipboard(): Promise<void> {
  localError.value = null
  if (!storeId.value || !asinOrSku.value.trim()) {
    localError.value = t('library.importNeedMeta')
    return
  }
  try {
    await library.importClipboard({
      storeId: storeId.value,
      asinOrSku: asinOrSku.value.trim(),
      assetType: assetType.value
    })
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error)
  }
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = true
}

function onDragLeave(): void {
  isDragOver.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  isDragOver.value = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths = files
    .map((file) => {
      try {
        return window.ximgs.getPathForFile(file)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
  await runImport(paths)
}
</script>

<template>
  <div class="panel">
    <h3>{{ t('library.import') }}</h3>
    <select v-model="storeId" class="control">
      <option :value="undefined">{{ t('library.selectStore') }}</option>
      <option v-for="store in library.stores" :key="store.id" :value="store.id">
        {{ store.name }}
      </option>
    </select>
    <input v-model="asinOrSku" class="control" :placeholder="t('library.asinPlaceholder')" />
    <select v-model="assetType" class="control">
      <option v-for="type in ASSET_TYPES" :key="type" :value="type">{{ type }}</option>
    </select>

    <div
      class="dropzone"
      :class="{ active: isDragOver }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      {{ t('library.dropHint') }}
    </div>

    <div class="actions">
      <button type="button" class="btn" :disabled="!canImport" @click="pickFiles">
        {{ t('library.pickFiles') }}
      </button>
      <button type="button" class="btn ghost" :disabled="!canImport" @click="pickFolder">
        {{ t('library.pickFolder') }}
      </button>
      <button type="button" class="btn ghost" :disabled="!canImport" @click="fromClipboard">
        {{ t('library.clipboard') }}
      </button>
      <button
        v-if="library.isImporting"
        type="button"
        class="btn danger"
        @click="library.cancelImport()"
      >
        {{ t('library.cancel') }}
      </button>
    </div>

    <p v-if="library.importProgress" class="progress">
      {{ library.importProgress.phase }}
      {{ library.importProgress.current }}/{{ library.importProgress.total }}
      {{ library.importProgress.message }}
    </p>
    <p v-if="library.lastImportResult" class="progress">
      {{
        t('library.importResult', {
          imported: library.lastImportResult.imported,
          skipped: library.lastImportResult.skippedDuplicates,
          failed: library.lastImportResult.failed
        })
      }}
    </p>
    <p v-if="localError" class="error">{{ localError }}</p>
  </div>
</template>

<style scoped>
.panel {
  padding: 0.9rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
}

.panel h3 {
  margin: 0 0 0.6rem;
  font-size: 0.95rem;
}

.control {
  width: 100%;
  margin-bottom: 0.45rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 0.45rem;
  background: #fff;
}

.dropzone {
  margin: 0.35rem 0 0.65rem;
  padding: 1rem 0.75rem;
  border: 1px dashed #9db4d4;
  border-radius: 0.55rem;
  text-align: center;
  color: var(--muted);
  background: #f7faff;
}

.dropzone.active {
  border-color: var(--accent);
  background: #eaf2ff;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.btn {
  border: 0;
  border-radius: 0.45rem;
  padding: 0.4rem 0.65rem;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.ghost {
  background: #e8eef8;
  color: var(--text);
}

.btn.danger {
  background: #d64545;
}

.progress {
  margin: 0.5rem 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}

.error {
  margin: 0.5rem 0 0;
  color: #8a1f1f;
  font-size: 0.85rem;
}
</style>
