import { createI18n } from 'vue-i18n'
import type { AppLocale } from '@shared/locale'
import { normalizeLocale } from '@shared/locale'
import { zhCN } from './zh-CN'
import { enUS } from './en-US'

export type { AppLocale }

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN' satisfies AppLocale,
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export function getAppLocale(): AppLocale {
  return normalizeLocale(i18n.global.locale.value)
}

export function applyLocale(locale: AppLocale): AppLocale {
  const next = normalizeLocale(locale)
  i18n.global.locale.value = next
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'en-US' ? 'en' : 'zh-CN'
  }
  return next
}
