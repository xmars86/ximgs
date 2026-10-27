import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp)$/i

export interface ScannedImage {
  absolutePath: string
  relativePath: string
  byteSize: number
}

export function isImageFileName(name: string): boolean {
  return IMAGE_EXT.test(name)
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
      walk(rootDir, full, out)
      continue
    }
    if (st.isFile() && isImageFileName(name)) {
      out.push({
        absolutePath: full,
        relativePath: relative(rootDir, full).replace(/\\/g, '/'),
        byteSize: st.size
      })
    }
  }
}
