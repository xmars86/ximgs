<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { AssetDto } from '@shared/library'

const props = defineProps<{ asset: AssetDto }>()
const emit = defineEmits<{ close: [] }>()

const scale = ref(1)

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const next = scale.value + (event.deltaY < 0 ? 0.1 : -0.1)
  scale.value = Math.min(4, Math.max(0.2, next))
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog">
      <header>
        <div>
          <strong>{{ props.asset.fileName }}</strong>
          <div class="meta">
            {{ props.asset.storeName }} / {{ props.asset.asinOrSku }} / {{ props.asset.assetType }}
            <span v-if="props.asset.width && props.asset.height">
              · {{ props.asset.width }}×{{ props.asset.height }}
            </span>
            <span v-if="props.asset.md5"> · md5 {{ props.asset.md5.slice(0, 8) }}…</span>
          </div>
        </div>
        <button type="button" class="btn" @click="emit('close')">关闭</button>
      </header>
      <div class="stage" @wheel="onWheel">
        <img
          :src="props.asset.previewUrl"
          :alt="props.asset.fileName"
          :style="{ transform: `scale(${scale})` }"
        />
      </div>
      <footer v-if="props.asset.note || props.asset.tags.length">
        <span v-if="props.asset.note">备注：{{ props.asset.note }}</span>
        <span v-if="props.asset.tags.length">
          标签：{{ props.asset.tags.map((t) => t.name).join(', ') }}
        </span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(12, 18, 28, 0.55);
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.dialog {
  width: min(1000px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 0.85rem;
  overflow: hidden;
}

header,
footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
}

footer {
  border-bottom: 0;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.85rem;
}

.meta {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.stage {
  flex: 1;
  min-height: 420px;
  overflow: auto;
  display: grid;
  place-items: center;
  background: #111827;
}

.stage img {
  max-width: 100%;
  max-height: 70vh;
  transition: transform 0.05s linear;
  transform-origin: center center;
}

.btn {
  border: 0;
  border-radius: 0.45rem;
  padding: 0.4rem 0.75rem;
  background: #e8eef8;
  cursor: pointer;
}
</style>
