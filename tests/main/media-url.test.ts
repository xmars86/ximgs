import { describe, expect, it } from 'vitest'
import {
  buildAssetMediaUrls,
  parseAssetMediaUrl
} from '../../src/main/domain/library/mediaUrl'

describe('media url', () => {
  it('builds and parses asset urls', () => {
    const urls = buildAssetMediaUrls(42)
    expect(parseAssetMediaUrl(urls.previewUrl)).toEqual({ assetId: 42, kind: 'preview' })
    expect(parseAssetMediaUrl(urls.thumbUrl)).toEqual({ assetId: 42, kind: 'thumb' })
  })
})
