import { describe, expect, it } from 'vitest'
import { localeLabel, normalizeLocale } from '../../src/shared/locale'

describe('normalizeLocale', () => {
  it('accepts zh-CN and aliases', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN')
    expect(normalizeLocale('zh')).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
    expect(normalizeLocale('fr')).toBe('zh-CN')
  })

  it('accepts en-US and aliases', () => {
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('en')).toBe('en-US')
  })

  it('labels match prototype', () => {
    expect(localeLabel('zh-CN')).toBe('简体中文')
    expect(localeLabel('en-US')).toBe('English')
  })
})
