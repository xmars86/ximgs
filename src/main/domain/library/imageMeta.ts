import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { nativeImage } from 'electron'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'])

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTS.has(extname(filePath).toLowerCase())
}

export function readImageSize(filePath: string): { width: number | null; height: number | null } {
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) {
      return { width: null, height: null }
    }
    const size = img.getSize()
    return { width: size.width || null, height: size.height || null }
  } catch {
    return { width: null, height: null }
  }
}

export function readImageSizeFromBuffer(buffer: Buffer): {
  width: number | null
  height: number | null
} {
  try {
    const img = nativeImage.createFromBuffer(buffer)
    if (img.isEmpty()) {
      return { width: null, height: null }
    }
    const size = img.getSize()
    return { width: size.width || null, height: size.height || null }
  } catch {
    return { width: null, height: null }
  }
}

/** Lightweight existence check without loading full decode when possible. */
export function peekFileHeader(filePath: string): Buffer {
  return readFileSync(filePath).subarray(0, 16)
}
