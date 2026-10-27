<script setup lang="ts">
import { useToastState } from './useToast'
import UiIcon from './UiIcon.vue'

const state = useToastState()

function iconName(kind: string): string {
  if (kind === 'err') return 'alert'
  if (kind === 'info') return 'info'
  return 'check'
}
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <div
      v-for="item in state.items"
      :key="item.id"
      class="toast"
      :class="[item.kind, { out: item.leaving }]"
    >
      <UiIcon :name="iconName(item.kind)" :size="15" />
      <span>{{ item.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.toast.err {
  background: #3a1515;
}

.toast.err :deep(svg) {
  color: #ff8f8f;
}

.toast.info {
  background: #101b2f;
}

.toast.info :deep(svg) {
  color: #7fb0ff;
}
</style>
