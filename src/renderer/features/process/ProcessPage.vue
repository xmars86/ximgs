<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '../../shared/ui/UiIcon.vue'

const { t } = useI18n()
</script>

<template>
  <div class="page-root">
    <div class="main-hd">
      <div>
        <h1>{{ t('pages.processTitle') }}</h1>
        <p class="sub">{{ t('pages.processDesc') }}</p>
      </div>
    </div>
    <div class="main-bd">
      <div class="card">
        <div class="empty">
          <div class="ico"><UiIcon name="sliders" :size="21" /></div>
          <b>{{ t('pages.processTitle') }}</b>
          <p>{{ t('pages.processDesc') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
