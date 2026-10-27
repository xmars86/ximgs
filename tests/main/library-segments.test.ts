import { describe, expect, it } from 'vitest'
import {
  assetTypeFolder,
  isImageExtension,
  sanitizeSegment,
  slugifyStoreName,
  toLibraryRelative
} from '../../src/main/domain/library/segments'
import { md5Buffer } from '../../src/main/domain/library/hash'
import { AppError } from '../../src/shared/errors'

describe('library segments', () => {
  it('slugifies store names', () => {
    expect(slugifyStoreName('My Amazon US')).toBe('my-amazon-us')
  })

  it('sanitizes valid asin/sku', () => {
    expect(sanitizeSegment('B0TEST1234', 'ASIN')).toBe('B0TEST1234')
    expect(sanitizeSegment('SKU_中文-01', 'SKU')).toBe('SKU_中文-01')
  })

  it('rejects unsafe path segments', () => {
    expect(() => sanitizeSegment('../x', 'ASIN')).toThrow(AppError)
    expect(() => sanitizeSegment('a/b', 'ASIN')).toThrow(AppError)
  })

  it('builds relative library paths', () => {
    expect(toLibraryRelative('shop', 'B0X', 'main', 'a.jpg')).toBe(
      'shop/B0X/original/main/a.jpg'
    )
  })

  it('validates asset types', () => {
    expect(assetTypeFolder('gallery')).toBe('gallery')
    expect(() => assetTypeFolder('other')).toThrow(AppError)
  })

  it('detects image extensions', () => {
    expect(isImageExtension('a.PNG')).toBe(true)
    expect(isImageExtension('a.txt')).toBe(false)
  })
})

describe('md5', () => {
  it('hashes buffers', () => {
    expect(md5Buffer(Buffer.from('ximgs'))).toMatch(/^[a-f0-9]{32}$/)
    expect(md5Buffer(Buffer.from('ximgs'))).toBe(md5Buffer(Buffer.from('ximgs')))
  })
})
