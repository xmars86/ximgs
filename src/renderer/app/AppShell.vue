<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { onShellEvent } from '../shared/bridge/client'
import { useBridgeStore } from '../shared/bridge/useBridgeStore'
import { useLocale } from '../shared/i18n/useLocale'
import { useGalleryStore } from '../features/library/useGalleryStore'
import { useSyncStore } from '../features/sync/useSyncStore'
import { showToast, toast } from '../shared/ui/useToast'
import UiIcon from '../shared/ui/UiIcon.vue'
import ToastHost from '../shared/ui/ToastHost.vue'
import logoUrl from '@brand/logo.png'

const { t } = useI18n()
const { current, setLocale } = useLocale()
const route = useRoute()
const bridge = useBridgeStore()
const sync = useSyncStore()
const gallery = useGalleryStore()
const bootError = ref<string | null>(null)
let stopShellEvents: (() => void) | null = null

const workNav = computed(() => [
  { to: '/skus', label: t('nav.sku'), icon: 'tag', badge: undefined as number | undefined },
  { to: '/library', label: t('nav.library'), icon: 'image', badge: undefined as number | undefined },
  { to: '/sync', label: t('nav.sync'), icon: 'cloud', badge: undefined as number | undefined },
  { to: '/logs', label: t('nav.logs'), icon: 'list', badge: undefined as number | undefined },
  {
    to: '/trash',
    label: t('nav.trash'),
    icon: 'trash',
    badge: gallery.trashCount > 0 ? gallery.trashCount : undefined
  }
])

const prefNav = computed(() => [
  { to: '/settings', label: t('nav.settings'), icon: 'sliders' }
])

const bucketLabel = computed(() => sync.config?.bucket?.trim() || t('shell.noBucket'))
const providerLabel = computed(() => {
  const p = sync.config?.provider
  if (p === 'r2') return t('sync.providerR2')
  if (p === 'aws') return t('sync.providerAws')
  if (p === 'oss') return t('sync.providerOss')
  if (p === 'cos') return t('sync.providerCos')
  if (p === 'qiniu') return t('sync.providerQiniu')
  if (p === 'b2') return 'Backblaze B2'
  if (p === 's3') return t('sync.providerS3')
  return t('shell.noProvider')
})

onMounted(async () => {
  const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (favicon) {
    favicon.href = logoUrl
  } else {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/png'
    link.href = logoUrl
    document.head.appendChild(link)
  }

  stopShellEvents = onShellEvent((event) => {
    if (event.type === 'toast') {
      toast[event.kind === 'ok' ? 'ok' : event.kind === 'err' ? 'err' : 'info'](event.message)
      return
    }
    if (event.type === 'tray-minimized' && event.firstTime) {
      showToast(t('shell.trayMinimizedHint'), 'info', 4200)
    }
  })

  try {
    await bridge.refreshShellStatus()
    await sync.refreshAll().catch(() => undefined)
    await gallery.refreshTrashCount().catch(() => undefined)
  } catch (error) {
    bootError.value = error instanceof Error ? error.message : String(error)
  }
})

onUnmounted(() => {
  stopShellEvents?.()
  stopShellEvents = null
})

</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="side-brand">
        <div class="mark">
          <img :src="logoUrl" alt="xImgs" />
        </div>
        <div>
          <div class="nm">xImgs</div>
          <div class="tag">{{ t('app.slogan') }}</div>
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-label">{{ t('nav.workbench') }}</div>
        <RouterLink
          v-for="item in workNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: route.path === item.to || route.path.startsWith(item.to + '/') }"
        >
          <UiIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
          <span v-if="item.badge != null" class="nav-badge">{{ item.badge }}</span>
        </RouterLink>
      </div>

      <div class="nav-group">
        <div class="nav-label">{{ t('nav.prefs') }}</div>
        <RouterLink
          v-for="item in prefNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: route.path === item.to }"
        >
          <UiIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </div>

      <div class="side-card">
        <div class="row">
          <span class="dot" :class="{ live: sync.status?.isSchedulerRunning }" />
          {{ providerLabel }}
        </div>
        <div class="sub">{{ bucketLabel }}</div>
      </div>

      <div class="side-foot">
        <span class="dot" :class="bridge.dbStatus?.isOpen ? '' : 'err'" />
        <span v-if="bridge.appInfo">v{{ bridge.appInfo.version }} · {{ t('app.milestone') }}</span>
        <span class="spacer" />
        <div class="lang-switch" role="group" :aria-label="t('settings.language')">
          <button
            type="button"
            :class="{ on: current === 'zh-CN' }"
            @click="setLocale('zh-CN')"
          >
            中
          </button>
          <button
            type="button"
            :class="{ on: current === 'en-US' }"
            @click="setLocale('en-US')"
          >
            EN
          </button>
        </div>
      </div>
    </aside>

    <main class="main">
      <div v-if="bootError" class="banner-inline error" style="margin: 16px 26px 0">
        {{ bootError }}
      </div>
      <RouterView />
    </main>
    <ToastHost />
  </div>
</template>
