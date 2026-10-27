import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'

const THUMB_SIZE = 240

export function getThumbsDir(): string {
  const dir = join(app.getPath('userData'), 'thumbs')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function thumbPathForMd5(md5: string): string {
  return join(getThumbsDir(), `${md5}.jpg`)
}

export function ensureThumbnail(sourcePath: string, md5: string): string {
  const out = thumbPathForMd5(md5)
  if (existsSync(out)) {
    return out
  }
  const img = nativeImage.createFromPath(sourcePath)
  if (img.isEmpty()) {
    throw new Error(`Cannot decode image: ${sourcePath}`)
  }
  const { width, height } = img.getSize()
  const scale = Math.min(THUMB_SIZE / Math.max(width, 1), THUMB_SIZE / Math.max(height, 1), 1)
  const resized = img.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: 'better'
  })
  writeFileSync(out, resized.toJPEG(82))
  return out
}

export function ensureThumbnailFromBuffer(buffer: Buffer, md5: string): string {
  const out = thumbPathForMd5(md5)
  if (existsSync(out)) {
    return out
  }
  const img = nativeImage.createFromBuffer(buffer)
  if (img.isEmpty()) {
    throw new Error('Cannot decode clipboard image')
  }
  const { width, height } = img.getSize()
  const scale = Math.min(THUMB_SIZE / Math.max(width, 1), THUMB_SIZE / Math.max(height, 1), 1)
  const resized = img.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: 'better'
  })
  writeFileSync(out, resized.toJPEG(82))
  return out
}
