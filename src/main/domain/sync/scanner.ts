import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi)$/i
const SYNC_MEDIA_EXT = /\.(jpe?g|png|gif|bmp|webp|mp4|mov|m4v|webm|avi)$/i

/** First char must be a letter (any script) or digit; else treat as system/special dir. */
const NORMAL_DIR_START = /^[\p{L}\p{N}]/u

export interface ScannedImage {
  absolutePath: string
  relativePath: string
  byteSize: number
}

export function isImageFileName(name: string): boolean {
  return IMAGE_EXT.test(name)
}

export function isVideoFileName(name: string): boolean {
  return VIDEO_EXT.test(name)
}

/** Images + videos accepted by folder sync / single upload. */
export function isSyncMediaFileName(name: string): boolean {
  return SYNC_MEDIA_EXT.test(name)
}

/**
 * Skip watch-tree dirs whose names start with a symbol
 * (e.g. Synology `@Recycle`, `#recycle`, `$RECYCLE.BIN`, `.Trash`).
 */
export function shouldSkipWatchDir(name: string): boolean {
  if (!name || name === '.' || name === '..') return true
  return !NORMAL_DIR_START.test(name)
}

export function scanImageFiles(rootDir: string): ScannedImage[] {
  const results: ScannedImage[] = []
  walk(rootDir, rootDir, results)
  return results
}

function walk(rootDir: string, dir: string, out: ScannedImage[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === '.' || name === '..') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (shouldSkipWatchDir(name)) continue
      walk(rootDir, full, out)
      continue
    }
    if (st.isFile() && isSyncMediaFileName(name)) {
      out.push({
        absolutePath: full,
        relativePath: relative(rootDir, full).replace(/\\/g, '/'),
        byteSize: st.size
      })
    }
  }
}
