/** UI locale codes used by AppConfig and vue-i18n. */
export type AppLocale = 'zh-CN' | 'en-US'

export function normalizeLocale(value: unknown): AppLocale {
  if (value === 'en-US' || value === 'en') return 'en-US'
  return 'zh-CN'
}

export function localeLabel(locale: AppLocale): string {
  return locale === 'en-US' ? 'English' : '简体中文'
}
