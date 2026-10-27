<script setup lang="ts">
import logoUrl from '@brand/logo.png'

withDefaults(
  defineProps<{
    size?: number
    alt?: string
  }>(),
  {
    size: 32,
    alt: 'xImgs'
  }
)
</script>

<template>
  <img
    class="brand-logo"
    :src="logoUrl"
    :alt="alt"
    :width="size"
    :height="size"
    draggable="false"
  />
</template>

<style scoped>
.brand-logo {
  display: block;
  object-fit: contain;
  border-radius: 0.45rem;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
</style>
