import { basename, extname, join } from 'node:path'
import { existsSync, statSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { clipboard } from 'electron'
import { AppError } from '@shared/errors'
import type { MultiUploadResult, SingleUploadResult } from '@shared/sync'
import { md5File } from '@main/domain/library/hash'
import {
  findSyncFileByPath,
  findSyncedByMd5,
  upsertSyncedFile
} from '@main/db/repos/syncFiles'
import { putObjectFile } from '@main/providers/s3'
import { b2PublicUrl, putB2ObjectFile } from '@main/providers/backblaze'
import { isSyncMediaFileName } from './scanner'
import { buildObjectKey, buildPublicUrl } from './objectKey'
import { scheduleMirrorToWatchFolder } from './mirrorLocal'
import { loadSyncSecret } from './secrets'
import { createUploadContext } from './uploadContext'

export interface UploadSingleOptions {
  /** Optional folder path (posix). Empty → auto `images/yyyy/mm/`. */
  folderPath?: string
}

function safeSegment(name: string): string {
  return name
    .replace(/[^\w.\u4e00-\u9fff-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function safeFileName(name: string): string {
  const ext = extname(name)
  const stem = safeSegment(basename(name, ext))
  return `${stem || 'file'}${ext.toLowerCase() || '.jpg'}`
}

/** Normalize user folder input: strip `..`, collapse slashes, sanitize segments. */
export function sanitizeUploadFolder(input?: string | null): string {
  if (!input?.trim()) return ''
  return input
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => safeSegment(part) || 'folder')
    .join('/')
}

function defaultManualFolder(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `images/${y}/${m}`
}

export function buildUploadRelativePath(fileName: string, folderPath?: string | null): string {
  const folder = sanitizeUploadFolder(folderPath) || defaultManualFolder()
  const name = safeFileName(fileName)
  // Auto folder keeps a stamp to avoid silent overwrites; custom folder uses clean names.
  if (!sanitizeUploadFolder(folderPath)) {
    const stamp = Date.now().toString(36)
    return `${folder}/${stamp}_${name}`
  }
  return `${folder}/${name}`
}

export async function uploadSingleImage(
  filePath: string,
  options: UploadSingleOptions = {}
): Promise<SingleUploadResult> {
  if (!filePath?.trim() || !existsSync(filePath)) {
    throw new AppError('FILE_NOT_FOUND', '文件不存在')
  }
  if (!isSyncMediaFileName(filePath)) {
    throw new AppError(
      'NOT_MEDIA',
      '仅支持 jpg / png / gif / bmp / webp / mp4 / mov / m4v / webm / avi'
    )
  }

  const secret = loadSyncSecret()
  if (!secret) {
    throw new AppError(
      'S3_SECRET_MISSING',
      '缺少 Application Key / Secret（请先在「同步上传」中保存）'
    )
  }

  const ctx = createUploadContext(secret)
  try {
    const md5 = await md5File(filePath)
    const existingByMd5 = findSyncedByMd5(md5)
    if (existingByMd5?.publicUrl) {
      // Best-effort: ensure watch folder has the same relative path as the existing cloud row.
      scheduleMirrorToWatchFolder(filePath, existingByMd5.relativePath)
      return {
        uploaded: false,
        deduplicated: true,
        file: existingByMd5
      }
    }

    const relativePath = buildUploadRelativePath(basename(filePath), options.folderPath)
    const objectKey = buildObjectKey(ctx.prefix, relativePath)
    const byteSize = statSync(filePath).size

    if (ctx.b2) {
      await putB2ObjectFile(ctx.client, ctx.b2, objectKey, filePath)
    } else {
      await putObjectFile(ctx.client, ctx.bucket, objectKey, filePath)
    }

    const publicUrl = ctx.b2
      ? b2PublicUrl(ctx.b2.publicBaseUrl, objectKey)
      : buildPublicUrl(ctx.publicBaseUrl, objectKey)

    upsertSyncedFile({
      relativePath,
      md5,
      objectKey,
      publicUrl,
      byteSize,
      status: 'synced',
      lastError: null
    })

    const file = findSyncFileByPath(relativePath)
    if (!file) {
      throw new AppError('UPLOAD_RECORD_MISSING', '上传成功但写入素材库记录失败')
    }
    // Cloud success is authoritative; local mirror failures are logged + retried separately.
    scheduleMirrorToWatchFolder(filePath, relativePath)
    return { uploaded: true, deduplicated: false, file }
  } finally {
    ctx.client.destroy()
  }
}

export async function uploadMultipleImages(
  filePaths: string[],
  options: UploadSingleOptions = {}
): Promise<MultiUploadResult> {
  const unique = [...new Set(filePaths.map((p) => p.trim()).filter(Boolean))]
  const result: MultiUploadResult = {
    uploaded: 0,
    deduplicated: 0,
    failed: 0,
    errors: [],
    urls: [],
    lastFile: null
  }
  for (const filePath of unique) {
    try {
      const one = await uploadSingleImage(filePath, options)
      if (one.deduplicated) result.deduplicated += 1
      else result.uploaded += 1
      result.lastFile = one.file
      if (one.file.publicUrl) result.urls.push(one.file.publicUrl)
    } catch (error) {
      result.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push(`${basename(filePath)}: ${message}`)
    }
  }
  return result
}

/** Save clipboard bitmap to a temp PNG, upload, then delete the temp file. */
export async function uploadClipboardImage(
  options: UploadSingleOptions = {}
): Promise<SingleUploadResult> {
  const image = clipboard.readImage()
  if (image.isEmpty()) {
    throw new AppError('CLIPBOARD_EMPTY', '剪贴板中没有图片，请先复制图片后再粘贴')
  }
  const dir = mkdtempSync(join(tmpdir(), 'ximgs-clip-'))
  const tempPath = join(dir, `clipboard_${Date.now()}.png`)
  try {
    writeFileSync(tempPath, image.toPNG())
    return await uploadSingleImage(tempPath, options)
  } finally {
    try {
      unlinkSync(tempPath)
    } catch {
      // ignore temp cleanup failures
    }
  }
}
