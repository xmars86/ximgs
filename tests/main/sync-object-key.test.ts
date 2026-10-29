import { describe, expect, it } from 'vitest'
import { buildObjectKey } from '../../src/main/domain/sync/objectKey'
import { buildPublicUrl, encodeObjectKeyForUrl } from '../../src/shared/publicUrl'
import { shouldUploadFile } from '../../src/main/domain/sync/shouldUpload'
import {
  isImageFileName,
  isSyncMediaFileName,
  isVideoFileName
} from '../../src/main/domain/sync/scanner'

describe('buildObjectKey', () => {
  it('joins prefix and relative path', () => {
    expect(buildObjectKey('img/', 'a/b.jpg')).toBe('img/a/b.jpg')
    expect(buildObjectKey('', 'a\\b.jpg')).toBe('a/b.jpg')
    expect(buildObjectKey('/cdn/', '/x.png')).toBe('cdn/x.png')
  })
})

describe('buildPublicUrl', () => {
  it('joins base url and key', () => {
    expect(buildPublicUrl('https://cdn.example.com/', 'a/b.jpg')).toBe(
      'https://cdn.example.com/a/b.jpg'
    )
  })

  it('percent-encodes path segments like + and CJK', () => {
    expect(
      buildPublicUrl(
        'https://cross.ximgs.top',
        '25-AZLY-00878/A+/1464x600/意大利/4-3.jpg'
      )
    ).toBe(
      'https://cross.ximgs.top/25-AZLY-00878/A%2B/1464x600/%E6%84%8F%E5%A4%A7%E5%88%A9/4-3.jpg'
    )
  })

  it('does not double-encode already encoded segments', () => {
    expect(encodeObjectKeyForUrl('A%2B/x.jpg')).toBe('A%2B/x.jpg')
  })
})

describe('shouldUploadFile', () => {
  it('skips when md5 unchanged', () => {
    expect(shouldUploadFile('abc', 'abc')).toBe(false)
  })

  it('uploads when missing or changed', () => {
    expect(shouldUploadFile(null, 'abc')).toBe(true)
    expect(shouldUploadFile('old', 'new')).toBe(true)
  })
})

describe('isImageFileName', () => {
  it('detects images', () => {
    expect(isImageFileName('x.PNG')).toBe(true)
    expect(isImageFileName('x.txt')).toBe(false)
    expect(isImageFileName('x.mp4')).toBe(false)
  })
})

describe('isVideoFileName', () => {
  it('detects videos', () => {
    expect(isVideoFileName('clip.MP4')).toBe(true)
    expect(isVideoFileName('a.mov')).toBe(true)
    expect(isVideoFileName('a.webm')).toBe(true)
    expect(isVideoFileName('a.jpg')).toBe(false)
  })
})

describe('isSyncMediaFileName', () => {
  it('accepts images and videos', () => {
    expect(isSyncMediaFileName('x.webp')).toBe(true)
    expect(isSyncMediaFileName('demo.m4v')).toBe(true)
    expect(isSyncMediaFileName('note.txt')).toBe(false)
  })
})
