import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppLocale } from '@shared/locale'
import { localeLabel } from '@shared/locale'
import { bridgeInvoke } from '../bridge/client'
import { toast } from '../ui/useToast'
import { applyLocale, getAppLocale } from './index'

export async function bootstrapLocale(): Promise<AppLocale> {
  try {
    const { locale } = await bridgeInvoke('system.getLocale')
    return applyLocale(locale)
  } catch {
    return applyLocale(getAppLocale())
  }
}

export async function setAppLocale(
  locale: AppLocale,
  options?: { toast?: boolean }
): Promise<AppLocale> {
  const next = applyLocale(locale)
  try {
    const res = await bridgeInvoke('system.setLocale', { locale: next })
    applyLocale(res.locale)
  } catch {
    // Keep UI language even if persist fails (e.g. outside Electron)
  }
  if (options?.toast !== false) {
    toast.ok(localeLabel(getAppLocale()))
  }
  return getAppLocale()
}

export function useLocale() {
  const { locale } = useI18n()
  const current = computed(() => getAppLocale())
  const currentLabel = computed(() => localeLabel(current.value))

  async function setLocale(next: AppLocale): Promise<void> {
    if (next === current.value) return
    await setAppLocale(next)
  }

  return {
    locale,
    current,
    currentLabel,
    setLocale,
    isZh: computed(() => current.value === 'zh-CN'),
    isEn: computed(() => current.value === 'en-US')
  }
}
