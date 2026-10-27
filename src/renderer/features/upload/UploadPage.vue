<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '../../shared/ui/UiIcon.vue'

const { t } = useI18n()
</script>

<template>
  <div class="page-root">
    <div class="main-hd">
      <div>
        <h1>{{ t('pages.uploadTitle') }}</h1>
        <p class="sub">{{ t('pages.uploadDesc') }}</p>
      </div>
    </div>
    <div class="main-bd">
      <div class="card">
        <div class="empty">
          <div class="ico"><UiIcon name="cloud" :size="21" /></div>
          <b>{{ t('pages.uploadTitle') }}</b>
          <p>{{ t('pages.uploadDesc') }}</p>
          <RouterLink class="btn primary" to="/sync">{{ t('nav.sync') }}</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
