<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { SyncProviderId } from '@shared/sync'
import { parseAppDate } from '@shared/datetime'
import { useSyncStore } from './useSyncStore'
import UiIcon from '../../shared/ui/UiIcon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const sync = useSyncStore()
const fileFilter = ref<'all' | 'error' | 'pending'>('all')
const nowMs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
let lastDuePollAt = 0

const form = reactive({
  intervalMinutes: 60,
  autoStart: false
})

const statusKind = computed(() => {
  if (sync.status?.isRunInProgress || sync.isBusy) return 'syncing'
  if (sync.status?.isSchedulerRunning) return 'running'
  return 'stopped'
})

const statusLabel = computed(() => {
  if (statusKind.value === 'syncing') return t('sync.inProgress')
  if (statusKind.value === 'running') return t('sync.running')
  return t('sync.stopped')
})

const isConfigured = computed(() => !!sync.checklist?.readyToSync)

const subtitleText = computed(() => {
  const folder = sync.config?.watchFolder
  const minutes = sync.config?.intervalMinutes ?? form.intervalMinutes
  const bucket = sync.config?.bucket?.trim()
  if (folder && bucket) {
    return t('sync.subtitleActive', { folder, minutes, bucket })
  }
  return t('sync.subtitle')
})

const last = computed(() => sync.lastRunResult)

const progressPercent = computed(() => {
  const p = sync.progress
  if (!p || !p.total) return 0
  return Math.min(100, Math.round((p.current / p.total) * 100))
})

const providerLabel = computed(() => {
  const p = sync.config?.provider as SyncProviderId | undefined
  if (p === 'r2') return t('sync.providerR2')
  if (p === 'aws') return t('sync.providerAws')
  if (p === 'oss') return t('sync.providerOss')
  if (p === 'cos') return t('sync.providerCos')
  if (p === 'qiniu') return t('sync.providerQiniu')
  if (p === 'b2') return 'Backblaze B2'
  if (p === 's3') return t('sync.providerS3')
  return t('sync.noBucketYet')
})

const nextScanRemainMs = computed(() => {
  if (!sync.status?.isSchedulerRunning || !sync.status.nextDueAt) return null
  return Math.max(0, new Date(sync.status.nextDueAt).getTime() - nowMs.value)
})

const nextScanLabel = computed(() => {
  if (statusKind.value === 'syncing') return `${progressPercent.value}%`
  const remain = nextScanRemainMs.value
  if (remain == null) return '—'
  const mm = Math.floor(remain / 60_000)
  const ss = Math.floor((remain % 60_000) / 1000)
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
})

const nextScanCap = computed(() => {
  if (statusKind.value === 'syncing') return t('sync.progressLabel')
  if (sync.status?.isSchedulerRunning) return t('sync.nextScan')
  return t('sync.schedulerStopped')
})

const failedFiles = computed(() => sync.files.filter((f) => f.status === 'error').slice(0, 4))

const pendingCount = computed(
  () => sync.files.filter((f) => f.status === 'pending' || f.status === 'queued').length
)

const dailyBars = computed(() => {
  const days = sync.dailyStats?.days ?? []
  const max = Math.max(1, ...days.map((d) => d.count))
  const todayKey = (() => {
    const n = new Date()
    const y = n.getFullYear()
    const m = String(n.getMonth() + 1).padStart(2, '0')
    const d = String(n.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()
  return days.map((point) => {
    const isToday = point.day === todayKey
    const height = point.count <= 0 ? 2 : Math.max(4, Math.round((point.count / max) * 72))
    const label = isToday ? t('sync.chartToday') : String(Number(point.day.slice(8, 10)))
    return { ...point, isToday, height, label }
  })
})

const dailyHint = computed(() => {
  const total = sync.dailyStats?.total ?? 0
  if (!total) return t('sync.chartEmpty')
  const avg = Math.round(total / Math.max(1, dailyBars.value.length))
  return t('sync.chartHint', { total, avg })
})

const filteredFiles = computed(() => {
  if (fileFilter.value === 'error') return sync.files.filter((f) => f.status === 'error')
  if (fileFilter.value === 'pending') {
    return sync.files.filter((f) => f.status === 'pending' || f.status === 'queued')
  }
  return sync.files
})

onMounted(async () => {
  await sync.refreshAll()
  hydrateForm()
  tickTimer = setInterval(() => {
    nowMs.value = Date.now()
    // After interval change / tick fire, nextDueAt updates in main — pull when local clock hits 0
    const remain = nextScanRemainMs.value
    const now = Date.now()
    if (
      remain === 0 &&
      sync.status?.isSchedulerRunning &&
      !sync.isBusy &&
      now - lastDuePollAt > 2000
    ) {
      lastDuePollAt = now
      void sync.refreshStatus()
    }
  }, 1000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})

watch(
  () => sync.config,
  () => hydrateForm()
)

function hydrateForm(): void {
  const c = sync.config
  if (!c) return
  form.intervalMinutes = c.intervalMinutes
  form.autoStart = c.autoStart
}

async function savePolicy(): Promise<void> {
  await sync.saveConfig({
    intervalMinutes: form.intervalMinutes,
    autoStart: form.autoStart
  })
}

function toggleAutoStart(): void {
  form.autoStart = !form.autoStart
  void savePolicy()
}

async function copyUrl(url: string): Promise<void> {
  await navigator.clipboard.writeText(url)
}

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function parentPath(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i > 0 ? norm.slice(0, i) : ''
}

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = parseAppDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function shortUrl(url: string | null): string {
  if (!url) return '—'
  try {
    const u = new URL(url)
    const tail = u.pathname.split('/').filter(Boolean).slice(-2).join('/')
    return `${u.host}/…/${tail}`
  } catch {
    return url.length > 42 ? `…${url.slice(-40)}` : url
  }
}

function statusBadge(status: string): string {
  if (status === 'synced') return t('library.statusSynced')
  if (status === 'error') return t('library.statusError')
  if (status === 'pending' || status === 'queued') return t('library.statusPending')
  return status
}

function goSettings(): void {
  void router.push('/settings')
}

function goLogs(): void {
  void router.push('/logs')
}
</script>

<template>
  <div class="page-root">
    <div class="main-hd">
      <div>
        <h1>
          {{ t('sync.title') }}
          <span
            class="pill-live"
            :style="
              statusKind === 'syncing'
                ? {
                    background: 'var(--brand-50)',
                    borderColor: 'var(--info-line)',
                    color: 'var(--brand-600)'
                  }
                : statusKind === 'stopped'
                  ? { background: '#f2f5fa', borderColor: 'var(--line)', color: 'var(--text-3)' }
                  : undefined
            "
          >
            <span
              class="dot"
              :class="{ live: statusKind !== 'stopped' }"
              :style="
                statusKind === 'syncing'
                  ? {
                      background: 'var(--brand)',
                      boxShadow: '0 0 0 3px rgba(27,110,243,.16)'
                    }
                  : statusKind === 'stopped'
                    ? { background: '#9aa8bc', boxShadow: 'none' }
                    : undefined
              "
            />
            {{ statusLabel }}
          </span>
          <span v-if="sync.failedCount > 0" class="badge err">
            {{ t('sync.failChip', { n: sync.failedCount }) }}
          </span>
        </h1>
        <p class="sub">{{ subtitleText }}</p>
      </div>
      <div class="hd-actions">
        <template v-if="isConfigured">
          <button type="button" class="btn icon" :title="t('sync.refresh')" @click="sync.refreshAll()">
            <UiIcon name="refresh" />
          </button>
          <button
            v-if="!sync.status?.isSchedulerRunning"
            type="button"
            class="btn"
            :disabled="sync.isBusy"
            @click="sync.start()"
          >
            {{ t('sync.start') }}
          </button>
          <button v-else type="button" class="btn" :disabled="sync.isBusy" @click="sync.stop()">
            <UiIcon name="pause" :size="15" />
            {{ t('sync.stop') }}
          </button>
          <button
            v-if="sync.failedCount > 0 && !sync.isBusy"
            type="button"
            class="btn"
            @click="sync.retryFailed()"
          >
            {{ t('sync.retryFailed') }}
          </button>
          <button
            v-if="!sync.isBusy && sync.status?.canResume"
            type="button"
            class="btn primary"
            @click="sync.resume()"
          >
            <UiIcon name="play" :size="15" />
            {{ t('sync.resume') }}
          </button>
          <button
            v-else-if="!sync.isBusy"
            type="button"
            class="btn primary"
            @click="sync.runNow()"
          >
            <UiIcon name="play" :size="15" />
            {{ t('sync.runNow') }}
          </button>
          <button v-else type="button" class="btn" @click="sync.pause()">
            <UiIcon name="pause" :size="15" />
            {{ t('sync.pause') }}
          </button>
        </template>
        <button v-else type="button" class="btn primary" @click="goSettings">
          <UiIcon name="plus" :size="15" />
          {{ t('sync.startSetup') }}
        </button>
      </div>
    </div>

    <div class="main-bd scroll">
      <div v-if="sync.errorMessage" class="banner-inline error">{{ sync.errorMessage }}</div>
      <div v-if="sync.status?.lastError" class="banner-inline error">{{ sync.status.lastError }}</div>

      <!-- Empty / first-run -->
      <div v-if="!isConfigured" class="card empty-sync">
        <div class="empty" style="padding: 62px 20px 44px; flex: 1; justify-content: center">
          <div class="ico"><UiIcon name="cloud" :size="22" /></div>
          <b>{{ t('sync.emptyTitle') }}</b>
          <p style="max-width: 460px">{{ t('sync.emptyBody') }}</p>
          <div class="row" style="margin-top: 10px">
            <button type="button" class="btn primary" @click="goSettings">
              {{ t('sync.startSetup') }}
            </button>
            <button type="button" class="btn" @click="sync.chooseFolder()">
              {{ t('sync.chooseFolder') }}
            </button>
          </div>
          <div class="row empty-checks">
            <span class="row" style="gap: 5px">
              <UiIcon name="check" :size="13" style="color: var(--ok)" />
              {{ t('sync.emptyCheck1') }}
            </span>
            <span class="row" style="gap: 5px">
              <UiIcon name="check" :size="13" style="color: var(--ok)" />
              {{ t('sync.emptyCheck2') }}
            </span>
            <span class="row" style="gap: 5px">
              <UiIcon name="check" :size="13" style="color: var(--ok)" />
              {{ t('sync.emptyCheck3') }}
            </span>
          </div>
        </div>
        <div class="empty-steps">
          <div>
            <span class="n">1</span>
            <b>{{ t('sync.guideStep1') }}</b>
            <span>{{ t('sync.emptyStep1Hint') }}</span>
          </div>
          <div>
            <span class="n">2</span>
            <b>{{ t('sync.guideStep2Short') }}</b>
            <span>{{ t('sync.emptyStep2Hint') }}</span>
          </div>
          <div>
            <span class="n">3</span>
            <b>{{ t('sync.guideStep3Short') }}</b>
            <span>{{ t('sync.emptyStep3Hint') }}</span>
          </div>
        </div>
      </div>

      <!-- Dashboard -->
      <div v-else class="stack">
        <div class="grid c4">
          <div class="kpi">
            <div class="k-top">
              <span class="k-ico brand"><UiIcon name="cloudCheck" :size="13" /></span>
              {{ t('sync.kpiTotal') }}
            </div>
            <div class="k-val">{{ sync.total }}<small>{{ t('sync.unitFiles') }}</small></div>
            <div class="k-foot">{{ t('sync.kpiTotalFoot') }}</div>
          </div>
          <div class="kpi">
            <div class="k-top">
              <span class="k-ico"><UiIcon name="database" :size="13" /></span>
              {{ t('sync.kpiUploaded') }}
            </div>
            <div class="k-val">{{ last?.uploaded ?? '—' }}</div>
            <div class="k-foot">{{ t('sync.kpiUploadedFoot') }}</div>
          </div>
          <div class="kpi">
            <div class="k-top">
              <span class="k-ico ok"><UiIcon name="skip" :size="13" /></span>
              {{ t('sync.kpiSkipped') }}
            </div>
            <div class="k-val">{{ last?.skipped ?? '—' }}</div>
            <div class="k-foot">{{ t('sync.kpiSkippedFoot') }}</div>
          </div>
          <div class="kpi">
            <div class="k-top">
              <span class="k-ico err"><UiIcon name="alert" :size="13" /></span>
              {{ t('sync.kpiFailed') }}
            </div>
            <div
              class="k-val"
              :style="(last?.failed ?? sync.failedCount) > 0 ? { color: 'var(--err)' } : undefined"
            >
              {{ last?.failed ?? sync.failedCount }}
            </div>
            <div class="k-foot">{{ t('sync.kpiFailedFoot') }}</div>
          </div>
        </div>

        <div class="grid side sync-layout">
          <div class="stack sync-main">
            <div class="card">
              <div class="card-hd">
                <h2>{{ t('sync.lastSync') }}</h2>
                <span v-if="statusKind === 'syncing'" class="badge brand">{{ t('sync.inProgress') }}</span>
                <span v-else-if="last?.paused || sync.status?.canResume" class="badge mute">{{
                  t('sync.paused')
                }}</span>
                <span v-else-if="last?.failed" class="badge err">{{ t('sync.partialFail') }}</span>
                <span v-else-if="last" class="badge ok">{{ t('sync.completed') }}</span>
                <span v-else class="badge mute">{{ t('sync.noRunYet') }}</span>
                <div class="spacer" />
                <span v-if="sync.status?.lastRunAt" class="hint">{{ formatTime(sync.status.lastRunAt) }}</span>
              </div>

              <div class="sync-hero">
                <div>
                  <div class="big">
                    <template v-if="statusKind === 'syncing' && sync.progress">
                      {{ sync.progress.current }}<small>/ {{ sync.progress.total }}</small>
                    </template>
                    <template v-else-if="last">
                      {{ last.uploaded }}<small>{{ t('sync.uploadedUnit') }}</small>
                    </template>
                    <template v-else>—</template>
                  </div>
                  <div class="cap" :style="last?.failed ? { color: 'var(--err)' } : undefined">
                    <template v-if="statusKind === 'syncing' && sync.progress">
                      {{ sync.progress.phase }} · {{ sync.progress.message }}
                    </template>
                    <template v-else-if="last?.paused || sync.status?.canResume">{{
                      t('sync.pausedCap')
                    }}</template>
                    <template v-else-if="last?.cancelled">{{ t('sync.cancelledCap') }}</template>
                    <template v-else-if="last?.failed">
                      {{ t('sync.failedCap', { n: last.failed }) }}
                    </template>
                    <template v-else-if="last">
                      {{ t('sync.okCap', { scanned: last.scanned }) }}
                    </template>
                    <template v-else>{{ t('sync.idleCap') }}</template>
                  </div>
                </div>
                <div class="right">
                  <div class="sync-countdown">{{ nextScanLabel }}</div>
                  <div class="l">{{ nextScanCap }}</div>
                </div>
              </div>

              <div v-if="statusKind === 'syncing'" style="padding: 0 18px 16px">
                <div class="progress"><i :style="{ width: `${progressPercent}%` }" /></div>
              </div>

              <div class="stat-strip">
                <div>
                  <div class="l">{{ t('sync.statScanned') }}</div>
                  <div class="v">{{ last?.scanned ?? '—' }}</div>
                </div>
                <div>
                  <div class="l">{{ t('sync.statUploaded') }}</div>
                  <div class="v">{{ last?.uploaded ?? '—' }}</div>
                </div>
                <div>
                  <div class="l">{{ t('sync.statSkipped') }}</div>
                  <div class="v">{{ last?.skipped ?? '—' }}</div>
                </div>
                <div>
                  <div class="l">{{ t('sync.statFailed') }}</div>
                  <div class="v" :class="{ err: (last?.failed ?? 0) > 0 }">
                    {{ last?.failed ?? '—' }}
                  </div>
                </div>
              </div>

              <div v-if="failedFiles.length" class="card-bd" style="padding-top: 14px">
                <div class="err-line">
                  <UiIcon name="alert" :size="15" />
                  <div>
                    <div v-for="f in failedFiles" :key="f.id">
                      <b>{{ fileName(f.relativePath) }}</b>
                      <template v-if="f.lastError"> · {{ f.lastError }}</template>
                    </div>
                  </div>
                </div>
                <div class="row" style="margin-top: 10px">
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="sync.isBusy"
                    @click="sync.retryFailed()"
                  >
                    {{ t('sync.retryFailed') }}
                  </button>
                  <button type="button" class="btn sm ghost" @click="goLogs">
                    {{ t('sync.viewLogs') }}
                  </button>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-hd">
                <h2>{{ t('sync.chartTitle') }}</h2>
                <span class="hint">{{ dailyHint }}</span>
                <div class="spacer" />
                <button type="button" class="btn sm ghost" @click="goLogs">
                  {{ t('sync.viewLogs') }}
                </button>
              </div>
              <div class="card-bd tight">
                <div class="bars" role="img" :aria-label="t('sync.chartTitle')">
                  <div
                    v-for="bar in dailyBars"
                    :key="bar.day"
                    class="bar"
                    :class="{ on: bar.isToday, zero: bar.count === 0 }"
                    :title="`${bar.day}: ${bar.count}`"
                  >
                    <span class="v">{{ bar.count }}</span>
                    <i :style="{ height: `${bar.height}px` }" />
                    <span class="d">{{ bar.label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="stack sync-side">
            <div class="card">
              <div class="card-hd">
                <h2>{{ t('sync.folder') }}</h2>
                <div class="spacer" />
                <button type="button" class="btn sm ghost" @click="sync.chooseFolder()">
                  {{ t('sync.chooseFolder') }}
                </button>
              </div>
              <div class="card-bd tight">
                <div class="path-box" :title="sync.config?.watchFolder || ''">
                  <UiIcon name="folder" :size="14" />
                  <span class="p">{{ sync.config?.watchFolder || t('sync.noFolder') }}</span>
                </div>
                <div class="cfg-row">
                  <span class="l">{{ t('sync.intervalShort') }}</span>
                  <span class="v">{{ t('sync.everyMinutes', { n: form.intervalMinutes }) }}</span>
                  <input
                    v-model.number="form.intervalMinutes"
                    class="input tnum"
                    type="number"
                    min="1"
                    max="1440"
                    style="width: 64px; height: 28px"
                    @change="savePolicy"
                  />
                </div>
                <div class="cfg-row">
                  <span class="l">{{ t('sync.prefixShort') }}</span>
                  <span class="v mono">{{ sync.config?.objectPrefix || '—' }}</span>
                </div>
                <div class="cfg-row">
                  <span class="l">{{ t('sync.autoStartShort') }}</span>
                  <span class="v">{{ form.autoStart ? t('sync.autoStartOn') : t('sync.autoStartOff') }}</span>
                  <button
                    type="button"
                    class="switch"
                    :class="{ on: form.autoStart }"
                    :aria-pressed="form.autoStart"
                    @click="toggleAutoStart"
                  />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-hd">
                <h2>{{ t('sync.bucket') }}</h2>
                <div class="spacer" />
                <span v-if="sync.checklist?.hasProviderConfig" class="badge ok">
                  <UiIcon name="check" :size="11" />
                  {{ t('sync.bucketConfigured') }}
                </span>
              </div>
              <div class="card-bd tight">
                <div class="cfg-row" style="padding-top: 2px">
                  <span class="l">{{ t('sync.provider') }}</span>
                  <span class="v">{{ providerLabel }}</span>
                </div>
                <div class="cfg-row">
                  <span class="l">Bucket</span>
                  <span class="v mono">{{ sync.config?.bucket || '—' }}</span>
                </div>
                <div class="cfg-row">
                  <span class="l">Endpoint</span>
                  <span class="v mono">{{ sync.config?.endpoint || '—' }}</span>
                </div>
                <div class="cfg-row">
                  <span class="l">{{ t('sync.publicBase') }}</span>
                  <span class="v mono">{{ sync.config?.publicBaseUrl || '—' }}</span>
                </div>
                <div class="row" style="padding-top: 10px">
                  <button type="button" class="btn sm" @click="goSettings">
                    {{ t('sync.openSettings') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd">
            <h2>{{ t('sync.files') }}</h2>
            <span class="badge mute">{{ sync.total }}</span>
            <div class="spacer" />
            <div class="seg" style="margin-right: 6px">
              <button type="button" :class="{ on: fileFilter === 'all' }" @click="fileFilter = 'all'">
                {{ t('sync.filterAll') }}
              </button>
              <button
                type="button"
                :class="{ on: fileFilter === 'error' }"
                @click="fileFilter = 'error'"
              >
                {{ t('sync.filterFailed', { n: sync.failedCount }) }}
              </button>
              <button
                type="button"
                :class="{ on: fileFilter === 'pending' }"
                @click="fileFilter = 'pending'"
              >
                {{ t('sync.filterPending', { n: pendingCount }) }}
              </button>
            </div>
            <RouterLink class="btn sm ghost" to="/library">{{ t('sync.viewAll') }}</RouterLink>
          </div>
          <div class="card-bd flush">
            <div class="table-wrap sync-files-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th style="width: 34%">{{ t('sync.colFile') }}</th>
                    <th style="width: 9%">{{ t('sync.colSize') }}</th>
                    <th style="width: 11%">{{ t('sync.colStatus') }}</th>
                    <th style="width: 12%">{{ t('sync.colSyncedAt') }}</th>
                    <th>{{ t('sync.colUrl') }}</th>
                    <th style="width: 76px" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="file in filteredFiles.slice(0, 40)" :key="file.id">
                    <td>
                      <div class="t-file">
                        <div style="min-width: 0">
                          <div class="nm" :title="file.relativePath">
                            {{ fileName(file.relativePath) }}
                          </div>
                          <div v-if="parentPath(file.relativePath)" class="pt">
                            {{ parentPath(file.relativePath) }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="tnum">{{ formatBytes(file.byteSize) }}</td>
                    <td>
                      <span
                        class="badge"
                        :class="{
                          ok: file.status === 'synced',
                          err: file.status === 'error',
                          mute: file.status !== 'synced' && file.status !== 'error'
                        }"
                      >
                        {{ statusBadge(file.status) }}
                      </span>
                      <div
                        v-if="file.lastError"
                        class="tip"
                        style="color: var(--err); margin-top: 3px"
                      >
                        {{ file.lastError }}
                      </div>
                    </td>
                    <td class="muted tnum">{{ formatTime(file.syncedAt) }}</td>
                    <td>
                      <div v-if="file.publicUrl" class="copy-row">
                        <span class="u" :title="file.publicUrl">{{ shortUrl(file.publicUrl) }}</span>
                        <button
                          type="button"
                          class="btn sm ghost"
                          :title="t('sync.copy')"
                          @click="copyUrl(file.publicUrl)"
                        >
                          <UiIcon name="copy" :size="13" />
                        </button>
                      </div>
                      <span v-else class="muted">—</span>
                    </td>
                    <td />
                  </tr>
                  <tr v-if="!filteredFiles.length">
                    <td colspan="6">
                      <div class="empty">
                        <div class="ico"><UiIcon name="image" :size="21" /></div>
                        <b>{{ t('sync.emptyFiles') }}</b>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sync-layout {
  align-items: start;
}

.sync-files-wrap {
  max-height: min(42vh, 480px);
}

.empty-sync {
  min-height: 560px;
  display: flex;
  flex-direction: column;
}

.empty-checks {
  margin-top: 20px;
  gap: 20px;
  color: var(--text-3);
  font-size: 11.5px;
}
</style>
