import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { getAssetAbsoluteMeta } from '@main/db/repos/assets'
import { resolveLibraryAbsolute } from './layout'
import { ensureThumbnail, thumbPathForMd5 } from './thumbs'
import { parseAssetMediaUrl } from './mediaUrl'
import { log } from '@main/runtime/logger'

export function registerMediaSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'ximgs',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: true
      }
    }
  ])
}

export function registerMediaProtocolHandler(): void {
  protocol.handle('ximgs', async (request) => {
    const parsed = parseAssetMediaUrl(request.url)
    if (!parsed) {
      return new Response('Bad Request', { status: 400 })
    }
    const meta = getAssetAbsoluteMeta(parsed.assetId)
    if (!meta || meta.isTrashed) {
      return new Response('Not Found', { status: 404 })
    }

    try {
      if (parsed.kind === 'thumb') {
        const cached = meta.md5 ? thumbPathForMd5(meta.md5) : null
        if (cached && existsSync(cached)) {
          return net.fetch(pathToFileURL(cached).toString())
        }
        const abs = resolveLibraryAbsolute(meta.relativePath)
        if (!existsSync(abs) || !meta.md5) {
          return new Response('Not Found', { status: 404 })
        }
        const thumb = ensureThumbnail(abs, meta.md5)
        return net.fetch(pathToFileURL(thumb).toString())
      }

      const abs = resolveLibraryAbsolute(meta.relativePath)
      if (!existsSync(abs)) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(abs).toString())
    } catch (error) {
      log.warn('ximgs protocol failed', { url: request.url, error })
      return new Response('Internal Error', { status: 500 })
    }
  })
}
