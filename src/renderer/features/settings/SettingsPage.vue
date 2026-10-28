<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { AUTHOR_CONTACT_EMAIL } from '@shared/contact'
import { deriveR2Endpoint, parseR2AccountId } from '@shared/r2'
import {
  deriveRegionalEndpoint,
  deriveRegionalPublicBase,
  isRegionalProvider
} from '@shared/regional'
import type { SyncProviderId } from '@shared/sync'
import { useBridgeStore } from '../../shared/bridge/useBridgeStore'
import { useLocale } from '../../shared/i18n/useLocale'
import { toast } from '../../shared/ui/useToast'
import { useSyncStore } from '../sync/useSyncStore'
import UiIcon from '../../shared/ui/UiIcon.vue'
import logoUrl from '@brand/logo.png'
import alipayQrUrl from '@brand/pay/pay_alipay.jpg'
import wechatPayQrUrl from '@brand/pay/pay_wechat.jpg'

const { t, locale } = useI18n()
const route = useRoute()
const { current, currentLabel, setLocale } = useLocale()
const bridge = useBridgeStore()
const sync = useSyncStore()
const panel = ref<'general' | 'storage' | 'sync' | 'security' | 'about'>('general')
const testOk = ref(false)
const dirty = ref(false)
const hydrating = ref(false)
const datePreview = computed(() =>
  new Date(2026, 9, 27, 14, 2).toLocaleString(locale.value, {
    year: 'numeric',
    month: locale.value === 'en-US' ? 'short' : 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
)

const form = reactive({
  intervalMinutes: 60,
  autoStart: false,
  objectPrefix: '',
  provider: 'b2' as SyncProviderId,
  accountId: '',
  endpoint: '',
  region: '',
  bucket: '',
  publicBaseUrl: '',
  accessKeyId: '',
  sseMode: '' as '' | 'AES256'
})

const derivedB2Endpoint = computed(() => {
  if (form.provider !== 'b2' || !form.region.trim()) return ''
  return `https://s3.${form.region.trim()}.backblazeb2.com`
})

const derivedR2Endpoint = computed(() => {
  if (form.provider !== 'r2') return ''
  return deriveR2Endpoint(form.accountId, '')
})

const derivedEndpoint = computed(() => {
  if (form.provider === 'b2') return derivedB2Endpoint.value
  if (form.provider === 'r2') return derivedR2Endpoint.value
  if (isRegionalProvider(form.provider)) {
    return deriveRegionalEndpoint(form.provider, form.region, '')
  }
  return ''
})

const derivedPublic = computed(() => {
  if (!isRegionalProvider(form.provider)) return ''
  return deriveRegionalPublicBase(form.provider, form.bucket, form.region, '')
})

const regionPlaceholder = computed(() => {
  if (form.provider === 'b2') return 'eu-central-003'
  if (form.provider === 'aws') return 'ap-southeast-1'
  if (form.provider === 'oss') return 'cn-hangzhou'
  if (form.provider === 'cos') return 'ap-guangzhou'
  return 'auto'
})

const endpointPlaceholder = computed(() => {
  if (derivedEndpoint.value) return derivedEndpoint.value
  if (form.provider === 'b2') return 'https://s3.<region>.backblazeb2.com'
  if (form.provider === 'r2') return 'https://<account-id>.r2.cloudflarestorage.com'
  if (form.provider === 'aws') return 'https://s3.<region>.amazonaws.com'
  if (form.provider === 'oss') return 'https://oss-<region>.aliyuncs.com'
  if (form.provider === 'cos') return 'https://cos.<region>.myqcloud.com'
  return 'https://s3.amazonaws.com'
})

const PROVIDER_HOST: Partial<Record<SyncProviderId, string>> = {
  r2: 'r2.cloudflarestorage.com',
  b2: 'backblazeb2.com',
  aws: 'amazonaws.com',
  oss: 'aliyuncs.com',
  cos: 'myqcloud.com'
}

const providers = computed(() => [
  {
    id: 'b2' as const,
    name: 'Backblaze B2',
    desc: t('settings.provB2'),
    icon: 'database' as const
  },
  {
    id: 'r2' as const,
    name: 'Cloudflare R2',
    desc: t('settings.provR2'),
    icon: 'globe' as const
  },
  {
    id: 'aws' as const,
    name: 'AWS S3',
    desc: t('settings.provAws'),
    icon: 'cloud' as const
  },
  {
    id: 'oss' as const,
    name: '阿里云 OSS',
    desc: t('settings.provOss'),
    icon: 'folder' as const
  },
  {
    id: 'cos' as const,
    name: '腾讯云 COS',
    desc: t('settings.provCos'),
    icon: 'image' as const
  },
  {
    id: 's3' as const,
    name: t('settings.provS3Name'),
    desc: t('settings.provS3'),
    icon: 'cloudCheck' as const
  }
])

onMounted(async () => {
  if (route.query.panel === 'security') {
    panel.value = 'security'
  }
  await bridge.refreshShellStatus()
  await sync.refreshAll()
  await hydrate()
})

watch(
  () => sync.config,
  () => {
    void hydrate()
  }
)

watch(
  form,
  () => {
    if (hydrating.value) return
    dirty.value = true
    testOk.value = false
  },
  { deep: true }
)

async function hydrate(): Promise<void> {
  const c = sync.config
  if (!c) return
  hydrating.value = true
  form.intervalMinutes = c.intervalMinutes
  form.autoStart = c.autoStart
  form.objectPrefix = c.objectPrefix
  form.provider = c.provider || 'b2'
  form.accountId = c.provider === 'r2' ? parseR2AccountId(c.endpoint) : ''
  form.endpoint = c.endpoint
  form.region = c.region
  form.bucket = c.bucket
  form.publicBaseUrl = c.publicBaseUrl
  form.accessKeyId = c.accessKeyId
  form.sseMode = c.sseMode === 'AES256' ? 'AES256' : ''
  await nextTick()
  hydrating.value = false
  dirty.value = false
}

function selectProvider(id: SyncProviderId): void {
  const previous = form.provider
  form.provider = id
  if (previous === id) return
  if (id === 'r2') form.region = 'auto'
  const marker = PROVIDER_HOST[id]
  if (id !== 's3' && form.endpoint && marker && !form.endpoint.includes(marker)) {
    form.endpoint = ''
  }
}

function resolvedEndpoint(): string {
  if (form.provider === 'b2') return form.endpoint.trim() || derivedB2Endpoint.value
  if (form.provider === 'r2') return deriveR2Endpoint(form.accountId, form.endpoint)
  if (isRegionalProvider(form.provider)) {
    return deriveRegionalEndpoint(form.provider, form.region, form.endpoint)
  }
  return form.endpoint.trim()
}

function resolvedPublicBase(): string {
  if (isRegionalProvider(form.provider)) {
    return deriveRegionalPublicBase(form.provider, form.bucket, form.region, form.publicBaseUrl)
  }
  return form.publicBaseUrl.trim()
}

async function saveStorage(): Promise<void> {
  await sync.saveConfig({
    provider: form.provider,
    endpoint: resolvedEndpoint(),
    region: form.provider === 'r2' ? form.region.trim() || 'auto' : form.region,
    bucket: form.bucket,
    publicBaseUrl: resolvedPublicBase(),
    accessKeyId: form.accessKeyId,
    sseMode: form.provider === 'b2' ? form.sseMode : '',
    secretAccessKey: sync.draftSecret || undefined,
    objectPrefix: form.objectPrefix
  })
  dirty.value = false
}

async function saveAndTest(): Promise<void> {
  await saveStorage()
  try {
    await sync.testConnection()
    testOk.value = true
  } catch {
    testOk.value = false
  }
}

async function saveSyncPolicy(): Promise<void> {
  await sync.saveConfig({
    intervalMinutes: form.intervalMinutes,
    autoStart: form.autoStart
  })
  dirty.value = false
}

async function saveCurrent(): Promise<void> {
  if (panel.value === 'storage') await saveStorage()
  else if (panel.value === 'sync') await saveSyncPolicy()
}

async function clearRecords(): Promise<void> {
  if (!sync.total) return
  if (!window.confirm(t('sync.clearFilesConfirm', { n: sync.total }))) return
  await sync.clearFiles()
}

async function copyAuthorEmail(): Promise<void> {
  try {
    await navigator.clipboard.writeText(AUTHOR_CONTACT_EMAIL)
    toast.ok(t('settings.contactCopied'))
  } catch {
    toast.err(t('settings.contactCopyFailed'))
  }
}

</script>

<template>
  <div class="page-root">
    <div class="main-hd">
      <div>
        <h1>{{ t('pages.settingsTitle') }}</h1>
        <p class="sub">{{ t('pages.settingsDesc') }}</p>
      </div>
      <div class="hd-actions">
        <span v-if="!dirty && sync.config" class="badge ok" style="height: 26px">
          <UiIcon name="check" :size="12" />
          {{ t('settings.saved') }}
        </span>
        <button
          v-if="panel === 'storage' || panel === 'sync'"
          type="button"
          class="btn primary"
          @click="saveCurrent"
        >
          {{ t('settings.saveChanges') }}
        </button>
      </div>
    </div>

    <div class="main-bd scroll">
      <div v-if="sync.errorMessage" class="banner-inline error">{{ sync.errorMessage }}</div>

      <div class="settings-grid">
        <nav class="set-nav">
          <button type="button" :class="{ on: panel === 'general' }" @click="panel = 'general'">
            <UiIcon name="globe" :size="15" />
            {{ t('settings.navGeneral') }}
          </button>
          <button type="button" :class="{ on: panel === 'storage' }" @click="panel = 'storage'">
            <UiIcon name="cloud" :size="15" />
            {{ t('settings.navStorage') }}
          </button>
          <button type="button" :class="{ on: panel === 'sync' }" @click="panel = 'sync'">
            <UiIcon name="sliders" :size="15" />
            {{ t('settings.navSync') }}
          </button>
          <button type="button" :class="{ on: panel === 'security' }" @click="panel = 'security'">
            <UiIcon name="shield" :size="15" />
            {{ t('settings.navSecurity') }}
          </button>
          <button type="button" :class="{ on: panel === 'about' }" @click="panel = 'about'">
            <UiIcon name="info" :size="15" />
            {{ t('settings.navAbout') }}
          </button>
        </nav>

        <div class="stack">
          <div v-if="panel === 'general'" class="card">
            <div class="card-hd">
              <h2>{{ t('settings.generalTitle') }}</h2>
              <div class="spacer" />
              <span class="hint">{{ t('settings.generalHint') }}</span>
            </div>
            <div class="card-bd">
              <div class="form-row">
                <div class="lbl"><b>{{ t('settings.language') }}</b></div>
                <div>
                  <div class="seg" style="padding: 3px">
                    <button
                      type="button"
                      :class="{ on: current === 'zh-CN' }"
                      @click="setLocale('zh-CN')"
                    >
                      {{ t('settings.langZh') }}
                    </button>
                    <button
                      type="button"
                      :class="{ on: current === 'en-US' }"
                      @click="setLocale('en-US')"
                    >
                      {{ t('settings.langEn') }}
                    </button>
                  </div>
                  <div class="tip" style="margin-top: 7px">{{ t('settings.languageTip') }}</div>
                </div>
              </div>
              <div class="form-row">
                <div class="lbl"><b>{{ t('settings.theme') }}</b></div>
                <div class="row" style="gap: 8px">
                  <div class="seg">
                    <button type="button" class="on">{{ t('settings.themeLight') }}</button>
                    <button type="button" disabled>{{ t('settings.themeDarkLater') }}</button>
                  </div>
                </div>
              </div>
              <div class="form-row">
                <div class="lbl"><b>{{ t('settings.dateFormat') }}</b></div>
                <div class="row" style="gap: 10px; flex-wrap: wrap">
                  <span class="badge mute">{{ datePreview }}</span>
                  <span class="muted" style="font-size: 11.5px">{{ t('settings.dateEnExample') }}</span>
                </div>
              </div>
            </div>
            <div class="set-foot">
              <span class="tip">{{ t('settings.languagePersist') }}</span>
              <div class="spacer" />
              <span class="tip">
                {{ t('settings.languageCurrent', { lang: currentLabel }) }}
              </span>
            </div>
          </div>

          <div v-else-if="panel === 'storage'" class="card">
            <div class="card-hd">
              <h2>{{ t('settings.storageTitle') }}</h2>
              <span v-if="sync.checklist?.hasProviderConfig" class="badge ok">
                <UiIcon name="check" :size="11" />
                {{ t('sync.bucketConfigured') }}
              </span>
              <div class="spacer" />
              <span class="hint">{{ t('settings.storageHint') }}</span>
            </div>
            <div class="card-bd">
              <div class="providers">
                <button
                  v-for="p in providers"
                  :key="p.id"
                  type="button"
                  class="prov"
                  :class="{ on: form.provider === p.id }"
                  @click="selectProvider(p.id)"
                >
                  <span class="tick"><UiIcon name="check" :size="9" /></span>
                  <div class="ic"><UiIcon :name="p.icon" :size="14" /></div>
                  <div class="nm">{{ p.name }}</div>
                  <div class="ds">{{ p.desc }}</div>
                </button>
              </div>

              <div class="hr" />

              <div v-if="form.provider === 'r2'" class="form-row">
                <div class="lbl">
                  <b>Account ID</b>
                  <span>{{ t('settings.accountIdHint') }}</span>
                </div>
                <div>
                  <input
                    v-model="form.accountId"
                    class="input mono"
                    style="max-width: 420px"
                    placeholder="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <div class="tip" style="margin-top: 5px">{{ t('settings.accountIdTip') }}</div>
                </div>
              </div>
              <div v-if="form.provider !== 'r2'" class="form-row">
                <div class="lbl"><b>Region</b><span>{{ t('settings.regionHint') }}</span></div>
                <input
                  v-model="form.region"
                  class="input"
                  style="max-width: 280px"
                  :placeholder="regionPlaceholder"
                />
              </div>
              <div class="form-row">
                <div class="lbl"><b>Endpoint</b><span>S3 API</span></div>
                <div>
                  <input
                    v-model="form.endpoint"
                    class="input mono"
                    :placeholder="endpointPlaceholder"
                  />
                  <div
                    v-if="derivedEndpoint && !form.endpoint.trim()"
                    class="tip"
                    style="margin-top: 5px"
                  >
                    {{ t('sync.endpointHint', { endpoint: derivedEndpoint }) }}
                  </div>
                  <div v-else-if="form.provider === 'r2'" class="tip" style="margin-top: 5px">
                    {{ t('settings.r2EndpointTip') }}
                  </div>
                  <div v-if="form.provider === 'oss'" class="tip" style="margin-top: 5px">
                    {{ t('settings.ossEndpointTip') }}
                  </div>
                </div>
              </div>
              <div class="form-row">
                <div class="lbl"><b>Bucket</b><span>{{ t('settings.bucketHint') }}</span></div>
                <div>
                  <input
                    v-model="form.bucket"
                    class="input mono"
                    style="max-width: 360px"
                    :placeholder="form.provider === 'cos' ? 'images-1250000000' : ''"
                  />
                  <div v-if="form.provider === 'cos'" class="tip" style="margin-top: 5px">
                    {{ t('settings.cosBucketTip') }}
                  </div>
                </div>
              </div>
              <div class="form-row">
                <div class="lbl">
                  <b>{{ t('sync.publicBase') }}</b>
                  <span>{{ t('settings.publicHint') }}</span>
                </div>
                <div>
                  <input
                    v-model="form.publicBaseUrl"
                    class="input mono"
                    :placeholder="
                      form.provider === 'r2'
                        ? 'https://pub-xxxx.r2.dev'
                        : derivedPublic || ''
                    "
                  />
                  <div v-if="form.provider === 'r2'" class="tip" style="margin-top: 5px">
                    {{ t('settings.r2PublicTip') }}
                  </div>
                  <div
                    v-else-if="derivedPublic && !form.publicBaseUrl.trim()"
                    class="tip"
                    style="margin-top: 5px"
                  >
                    {{ t('sync.endpointHint', { endpoint: derivedPublic }) }}
                  </div>
                  <div
                    v-else-if="form.provider === 'aws' || form.provider === 'oss' || form.provider === 'cos'"
                    class="tip"
                    style="margin-top: 5px"
                  >
                    {{ t('settings.regionalPublicTip') }}
                  </div>
                </div>
              </div>
              <div class="form-row">
                <div class="lbl">
                  <b>{{ t('sync.prefix') }}</b>
                  <span>{{ t('settings.prefixHint') }}</span>
                </div>
                <input
                  v-model="form.objectPrefix"
                  class="input mono"
                  style="max-width: 280px"
                  placeholder="images/"
                />
              </div>
              <div class="form-row">
                <div class="lbl">
                  <b>{{ form.provider === 'b2' ? 'Key ID' : 'Access Key ID' }}</b>
                  <span>{{ t('settings.keyHint') }}</span>
                </div>
                <input
                  v-model="form.accessKeyId"
                  class="input mono"
                  style="max-width: 360px"
                  autocomplete="off"
                />
              </div>
              <div class="form-row">
                <div class="lbl">
                  <b>{{ form.provider === 'b2' ? 'Application Key' : 'Secret Access Key' }}</b>
                  <span>{{ t('settings.secretHint') }}</span>
                </div>
                <div>
                  <input
                    v-model="sync.draftSecret"
                    class="input"
                    type="password"
                    style="max-width: 360px"
                    autocomplete="new-password"
                    :placeholder="sync.config?.hasSecretAccessKey ? t('sync.secretKeep') : ''"
                  />
                  <div class="row" style="margin-top: 6px; gap: 6px">
                    <span v-if="sync.config?.hasSecretAccessKey" class="badge mute">
                      <UiIcon name="lock" :size="11" />
                      {{ t('settings.secretEncrypted') }}
                    </span>
                    <span class="tip">{{ t('sync.secretKeep') }}</span>
                  </div>
                </div>
              </div>
              <div v-if="form.provider === 'b2'" class="form-row">
                <div class="lbl"><b>SSE-B2</b><span>AES256</span></div>
                <select v-model="form.sseMode" class="select" style="max-width: 220px">
                  <option value="">{{ t('sync.sseOff') }}</option>
                  <option value="AES256">AES256</option>
                </select>
              </div>
            </div>
            <div class="set-foot">
              <button type="button" class="btn" @click="saveAndTest">
                <UiIcon name="wifi" :size="14" />
                {{ t('sync.testConnection') }}
              </button>
              <span v-if="testOk" class="test-ok">
                <UiIcon name="check" :size="14" />
                {{ t('settings.testOk') }}
              </span>
              <div class="spacer" />
              <button type="button" class="btn primary" @click="saveStorage">
                {{ t('sync.save') }}
              </button>
            </div>
          </div>

          <div v-else-if="panel === 'sync'" class="card">
            <div class="card-hd">
              <h2>{{ t('settings.syncTitle') }}</h2>
              <div class="spacer" />
              <span class="hint">{{ t('settings.syncHint') }}</span>
            </div>
            <div class="card-bd">
              <div class="form-row">
                <div class="lbl">
                  <b>{{ t('sync.interval') }}</b>
                  <span>{{ t('settings.intervalHint') }}</span>
                </div>
                <div class="row">
                  <input
                    v-model.number="form.intervalMinutes"
                    class="input tnum"
                    type="number"
                    min="1"
                    max="1440"
                    style="width: 76px"
                  />
                  <span class="muted" style="font-size: 12px">{{ t('settings.minutes') }}</span>
                </div>
              </div>
              <div class="form-row">
                <div class="lbl">
                  <b>{{ t('settings.startup') }}</b>
                  <span>{{ t('settings.startupHint') }}</span>
                </div>
                <div class="switch-row" style="padding-top: 0">
                  <div class="txt">
                    <b>{{ t('sync.autoStartTitle') }}</b>
                    <span>{{ t('sync.autoStart') }}</span>
                  </div>
                  <button
                    type="button"
                    class="switch"
                    :class="{ on: form.autoStart }"
                    @click="form.autoStart = !form.autoStart"
                  />
                </div>
              </div>
              <div class="form-row">
                <div class="lbl">
                  <b>{{ t('sync.folder') }}</b>
                  <span>{{ t('settings.folderHint') }}</span>
                </div>
                <div>
                  <div class="path-box">
                    <UiIcon name="folder" :size="14" />
                    <span class="p">{{ sync.config?.watchFolder || t('sync.noFolder') }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn sm"
                    style="margin-top: 8px"
                    @click="sync.chooseFolder()"
                  >
                    {{ t('sync.chooseFolder') }}
                  </button>
                </div>
              </div>
            </div>
            <div class="set-foot">
              <span class="tip">{{ t('settings.incrementalOnly') }}</span>
              <div class="spacer" />
              <button type="button" class="btn primary" @click="saveSyncPolicy">
                {{ t('settings.savePolicy') }}
              </button>
            </div>
          </div>

          <div v-else-if="panel === 'security'" class="card">
            <div class="card-hd"><h2>{{ t('settings.securityTitle') }}</h2></div>
            <div class="card-bd">
              <div class="edition-card">
                <div class="edition-card-top">
                  <div class="edition-card-mark">
                    <UiIcon name="shield" :size="22" />
                  </div>
                  <div class="edition-card-copy">
                    <div class="edition-card-title">{{ t('settings.freeTitle') }}</div>
                    <div class="edition-card-hint">{{ t('settings.freeHint') }}</div>
                  </div>
                  <span class="badge ok">{{ t('settings.freeBadge') }}</span>
                </div>
                <div class="edition-contact">
                  <div>
                    <b>{{ t('settings.customizationTitle') }}</b>
                    <span>{{ t('settings.customizationHint') }}</span>
                  </div>
                  <button type="button" class="contact-email" @click="copyAuthorEmail">
                    <span class="mono">{{ AUTHOR_CONTACT_EMAIL }}</span>
                    <UiIcon name="copy" :size="13" />
                  </button>
                </div>
              </div>

              <section class="donation security-donation">
                <div class="donation-copy">
                  <span class="donation-kicker">{{ t('settings.donationKicker') }}</span>
                  <div class="donation-title">{{ t('settings.donationTitle') }}</div>
                  <p>{{ t('settings.donationDescription') }}</p>
                  <span>{{ t('settings.donationThanks') }}</span>
                </div>
                <div class="donation-codes">
                  <figure>
                    <div class="donation-code-frame wechat">
                      <img :src="wechatPayQrUrl" :alt="t('settings.wechatPay')" />
                    </div>
                    <figcaption><span class="pay-dot wechat" />{{ t('settings.wechatPay') }}</figcaption>
                  </figure>
                  <figure>
                    <div class="donation-code-frame alipay">
                      <img :src="alipayQrUrl" :alt="t('settings.alipay')" />
                    </div>
                    <figcaption><span class="pay-dot alipay" />{{ t('settings.alipay') }}</figcaption>
                  </figure>
                </div>
              </section>

              <section class="security-data">
                <div class="security-section-heading">
                  <div>
                    <b>{{ t('settings.localSecurityTitle') }}</b>
                    <span>{{ t('settings.localSecurityHint') }}</span>
                  </div>
                  <UiIcon name="database" :size="18" />
                </div>
                <div class="form-row">
                  <div class="lbl">
                    <b>{{ t('settings.secretStore') }}</b>
                    <span>Electron safeStorage</span>
                  </div>
                  <div class="row" style="gap: 7px">
                    <span class="badge ok">
                      <UiIcon name="shield" :size="11" />
                      {{ t('settings.secretEncrypted') }}
                    </span>
                    <span class="tip">{{ t('settings.secretTip') }}</span>
                  </div>
                </div>
                <div class="form-row">
                  <div class="lbl">
                    <b>{{ t('settings.localDb') }}</b>
                    <span>SQLite</span>
                  </div>
                  <div>
                    <div class="row" style="gap: 7px">
                      <span v-if="bridge.dbStatus" class="badge ok">
                        migration m{{ bridge.dbStatus.migrationVersion }}
                      </span>
                      <span class="badge mute">
                        {{ bridge.dbStatus?.isOpen ? t('settings.dbOpen') : t('settings.dbClosed') }}
                      </span>
                    </div>
                    <div v-if="bridge.paths" class="copy-row" style="margin-top: 8px">
                      <span class="u">{{ bridge.paths.userData }}</span>
                    </div>
                  </div>
                </div>
                <div class="form-row">
                  <div class="lbl">
                    <b>{{ t('settings.danger') }}</b>
                    <span>{{ t('settings.dangerHint') }}</span>
                  </div>
                  <div class="row wrap" style="gap: 8px">
                    <button
                      type="button"
                      class="btn danger"
                      :disabled="!sync.total || sync.isBusy"
                      @click="clearRecords"
                    >
                      <UiIcon name="trash" :size="14" />
                      {{ t('sync.clearFiles') }}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div v-else class="card">
            <div class="card-hd"><h2>{{ t('settings.aboutTitle') }}</h2></div>
            <div class="card-bd">
              <div class="about-hero">
                <img :src="logoUrl" alt="xImgs" />
                <div class="about-hero-copy">
                  <div class="nm">xImgs</div>
                  <div class="ds">{{ t('settings.aboutSlogan') }}</div>
                  <div class="traits">{{ t('settings.productTraits') }}</div>
                </div>
                <span v-if="bridge.appInfo" class="ver">v{{ bridge.appInfo.version }}</span>
              </div>
              <div class="hr" />
              <table style="width: 100%; border-collapse: collapse; font-size: 12px">
                <tbody>
                  <tr>
                    <td style="width: 120px; padding: 7px 0; color: var(--text-3)">
                      {{ t('settings.runtime') }}
                    </td>
                    <td style="padding: 7px 0">
                      <template v-if="bridge.appInfo">
                        Electron {{ bridge.appInfo.electron }} · {{ bridge.appInfo.platform }}
                      </template>
                      <template v-else>—</template>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; color: var(--text-3)">{{ t('settings.userData') }}</td>
                    <td style="padding: 7px 0" class="mono">
                      {{ bridge.paths?.userData || '—' }}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; color: var(--text-3)">{{ t('settings.scope') }}</td>
                    <td style="padding: 7px 0">{{ t('settings.scopeValue') }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="hr" />
              <div class="disclaimer">
                <div class="disclaimer-hd">{{ t('settings.disclaimerTitle') }}</div>
                <p>
                  {{ t('settings.disclaimerP1Lead') }}
                  <strong>{{ t('settings.disclaimerP1Emphasis') }}</strong>
                  {{ t('settings.disclaimerP1Tail') }}
                </p>
                <p>{{ t('settings.disclaimerP2') }}</p>
                <p>{{ t('settings.disclaimerP3') }}</p>
                <p class="disclaimer-foot">{{ t('settings.disclaimerP4') }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
