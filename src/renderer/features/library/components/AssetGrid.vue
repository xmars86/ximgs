<script setup lang="ts">
import type { AssetDto } from '@shared/library'

defineProps<{
  assets: AssetDto[]
  selectedIds: number[]
}>()

const emit = defineEmits<{
  toggle: [id: number]
  preview: [asset: AssetDto]
}>()
</script>

<template>
  <div v-if="!assets.length" class="empty">暂无素材，请先导入图片。</div>
  <div v-else class="grid">
    <article
      v-for="asset in assets"
      :key="asset.id"
      class="card"
      :class="{ selected: selectedIds.includes(asset.id) }"
      @click="emit('toggle', asset.id)"
      @dblclick.stop="emit('preview', asset)"
    >
      <div class="thumb-wrap">
        <img :src="asset.thumbUrl" :alt="asset.fileName" loading="lazy" />
      </div>
      <div class="info">
        <div class="name" :title="asset.fileName">{{ asset.fileName }}</div>
        <div class="sub">{{ asset.asinOrSku }} · {{ asset.assetType }}</div>
        <div class="sub">
          <span v-if="asset.width && asset.height">{{ asset.width }}×{{ asset.height }}</span>
          <span v-if="asset.tags.length"> · {{ asset.tags.map((t) => t.name).join(', ') }}</span>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.75rem;
}

.card {
  border: 1px solid var(--border);
  border-radius: 0.7rem;
  overflow: hidden;
  background: var(--card);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.card:hover {
  border-color: #9db6dc;
}

.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.2);
}

.thumb-wrap {
  aspect-ratio: 1;
  background: #edf2f8;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.thumb-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.info {
  padding: 0.55rem 0.6rem 0.7rem;
}

.name {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty {
  padding: 2rem;
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--border);
  border-radius: 0.75rem;
  background: #fff;
}
</style>
