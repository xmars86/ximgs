export function buildAssetMediaUrls(assetId: number): {
  previewUrl: string
  thumbUrl: string
} {
  // Host-style URL so Chromium parses stably: ximgs://asset/<id>?kind=
  return {
    previewUrl: `ximgs://asset/${assetId}?kind=preview`,
    thumbUrl: `ximgs://asset/${assetId}?kind=thumb`
  }
}

export function parseAssetMediaUrl(
  url: string
): { assetId: number; kind: 'preview' | 'thumb' } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'ximgs:') {
      return null
    }

    let assetId: number | null = null
    if (parsed.hostname === 'asset') {
      assetId = Number(parsed.pathname.replace(/^\/+/, ''))
    } else {
      const parts = parsed.pathname.replace(/^\/+/, '').split('/')
      if (parts[0] === 'asset' && parts[1]) {
        assetId = Number(parts[1])
      }
    }

    if (assetId == null || !Number.isFinite(assetId)) {
      return null
    }
    const kind = parsed.searchParams.get('kind') === 'thumb' ? 'thumb' : 'preview'
    return { assetId, kind }
  } catch {
    return null
  }
}
