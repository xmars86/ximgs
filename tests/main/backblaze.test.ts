import { describe, expect, it } from 'vitest'
import {
  b2PublicUrl,
  deriveB2Endpoint,
  normalizeKeyPrefix,
  resolveB2Config
} from '../../src/main/providers/backblaze'
import { AppError } from '../../src/shared/errors'

describe('deriveB2Endpoint', () => {
  it('builds endpoint from region', () => {
    expect(deriveB2Endpoint('eu-central-003')).toBe(
      'https://s3.eu-central-003.backblazeb2.com'
    )
  })

  it('prefers explicit endpoint', () => {
    expect(deriveB2Endpoint('eu-central-003', 'https://s3.custom.example/')).toBe(
      'https://s3.custom.example'
    )
  })
})

describe('normalizeKeyPrefix', () => {
  it('ensures trailing slash', () => {
    expect(normalizeKeyPrefix('sku')).toBe('sku/')
    expect(normalizeKeyPrefix('/sku/')).toBe('sku/')
    expect(normalizeKeyPrefix('')).toBe('')
  })
})

describe('resolveB2Config', () => {
  const base = {
    keyId: '0030f1a647a72cc0000000001',
    applicationKey: 'K003dummy-application-key-value',
    bucketName: 'quickimg',
    region: 'eu-central-003',
    publicBaseUrl: 'https://cdn.example.com/'
  }

  it('resolves defaults', () => {
    const cfg = resolveB2Config(base)
    expect(cfg.endpoint).toBe('https://s3.eu-central-003.backblazeb2.com')
    expect(cfg.publicBaseUrl).toBe('https://cdn.example.com')
    expect(cfg.keyPrefix).toBe('')
  })

  it('rejects short key id', () => {
    expect(() => resolveB2Config({ ...base, keyId: 'short' })).toThrow(AppError)
  })

  it('requires public base url', () => {
    expect(() => resolveB2Config({ ...base, publicBaseUrl: '' })).toThrow(AppError)
  })
})

describe('b2PublicUrl', () => {
  it('joins base and key', () => {
    expect(b2PublicUrl('https://cdn.example.com/', 'a/b.jpg')).toBe(
      'https://cdn.example.com/a/b.jpg'
    )
  })
})
