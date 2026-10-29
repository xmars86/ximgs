import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'

export interface S3UploadConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
  timeoutMs?: number
  maxAttempts?: number
  /** R2 rejects default CRC32 checksum headers from recent AWS SDK v3. */
  requestChecksumCalculation?: 'WHEN_SUPPORTED' | 'WHEN_REQUIRED'
  responseChecksumValidation?: 'WHEN_SUPPORTED' | 'WHEN_REQUIRED'
}

export interface PutObjectOptions {
  serverSideEncryption?: 'AES256'
}

function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.webp':
      return 'image/webp'
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.avi':
      return 'video/x-msvideo'
    default:
      return 'application/octet-stream'
  }
}

export function createS3Client(config: S3UploadConfig): S3Client {
  const endpoint = config.endpoint.trim()
  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 30_000
  const forcePathStyle =
    config.forcePathStyle ??
    (Boolean(endpoint) && /backblazeb2\.com/i.test(endpoint) ? true : Boolean(endpoint))

  return new S3Client({
    region: config.region.trim() || 'auto',
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    maxAttempts: config.maxAttempts ?? 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: timeoutMs,
      requestTimeout: timeoutMs
    }),
    ...(config.requestChecksumCalculation
      ? { requestChecksumCalculation: config.requestChecksumCalculation }
      : {}),
    ...(config.responseChecksumValidation
      ? { responseChecksumValidation: config.responseChecksumValidation }
      : {})
  })
}

export async function putObjectFile(
  client: S3Client,
  bucket: string,
  objectKey: string,
  filePath: string,
  options: PutObjectOptions = {}
): Promise<void> {
  const body = createReadStream(filePath)
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentTypeFor(filePath),
      ...(options.serverSideEncryption
        ? { ServerSideEncryption: options.serverSideEncryption }
        : {})
    })
  )
}

export async function deleteObjectFile(
  client: S3Client,
  bucket: string,
  objectKey: string,
  versionId?: string
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ...(versionId ? { VersionId: versionId } : {})
    })
  )
}

/** Treat missing remote keys as already deleted (idempotent purge). */
export function isRemoteObjectMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    name?: string
    Code?: string
    code?: string
    $metadata?: { httpStatusCode?: number }
  }
  const code = String(err.name || err.Code || err.code || '')
  if (code === 'NotFound' || code === 'NoSuchKey' || code === 'NoSuchVersion') return true
  return err.$metadata?.httpStatusCode === 404
}

function isListVersionsUnsupported(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    name?: string
    Code?: string
    code?: string
    message?: string
    $metadata?: { httpStatusCode?: number }
  }
  const code = String(err.name || err.Code || err.code || '')
  const status = err.$metadata?.httpStatusCode
  if (status === 404 || status === 405 || status === 501) return true
  if (/NotImplemented|MethodNotAllowed|UnsupportedOperation|InvalidRequest/i.test(code)) {
    return true
  }
  if (/listing.*version|versioning.*not.*(support|enable)/i.test(String(err.message ?? ''))) {
    return true
  }
  return false
}

export async function remoteObjectExists(
  client: S3Client,
  bucket: string,
  objectKey: string
): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey
      })
    )
    return true
  } catch (error) {
    if (isRemoteObjectMissingError(error)) return false
    throw error
  }
}

/**
 * Permanently remove every version / delete-marker for an exact object key.
 * Critical for B2: buckets are versioned by default; DeleteObject without VersionId
 * only inserts a hide/delete-marker, leaving prior versions (and console rows) behind.
 * Returns how many version rows were deleted.
 */
export async function deleteAllObjectVersions(
  client: S3Client,
  bucket: string,
  objectKey: string
): Promise<number> {
  const key = objectKey.replace(/^\/+/, '')
  let deleted = 0
  let keyMarker: string | undefined
  let versionIdMarker: string | undefined
  let isTruncated = true

  while (isTruncated) {
    const page = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker
      })
    )

    const rows = [
      ...(page.Versions ?? []).map((v) => ({
        key: v.Key,
        versionId: v.VersionId
      })),
      ...(page.DeleteMarkers ?? []).map((v) => ({
        key: v.Key,
        versionId: v.VersionId
      }))
    ].filter((row) => row.key === key && row.versionId)

    for (const row of rows) {
      await deleteObjectFile(client, bucket, key, row.versionId)
      deleted += 1
    }

    isTruncated = Boolean(page.IsTruncated)
    keyMarker = page.NextKeyMarker
    versionIdMarker = page.NextVersionIdMarker
    // Prefix listing can include sibling keys; stop once markers pass our key.
    if (isTruncated && keyMarker && keyMarker > key) {
      break
    }
  }

  return deleted
}

/**
 * Delete a remote object and verify the current key is gone.
 * Prefers deleting all versions (B2-safe); falls back to a single DeleteObject
 * when the provider does not support ListObjectVersions.
 */
export async function deleteObjectFileVerified(
  client: S3Client,
  bucket: string,
  objectKey: string
): Promise<'deleted' | 'already_missing'> {
  const key = objectKey.replace(/^\/+/, '')
  let removed = 0
  let listedVersions = false

  try {
    removed = await deleteAllObjectVersions(client, bucket, key)
    listedVersions = true
  } catch (error) {
    if (!isListVersionsUnsupported(error)) throw error
  }

  const headExists = await remoteObjectExists(client, bucket, key)
  if (!listedVersions) {
    if (!headExists && removed === 0) return 'already_missing'
    if (headExists) {
      await deleteObjectFile(client, bucket, key)
      removed += 1
    }
  } else if (headExists) {
    // Version list empty/incomplete but current object still readable — last resort.
    await deleteObjectFile(client, bucket, key)
    removed += 1
  }

  const stillThere = await remoteObjectExists(client, bucket, key)
  if (stillThere) {
    throw new Error(`DeleteObject 后对象仍存在：${key}`)
  }

  return removed > 0 ? 'deleted' : 'already_missing'
}
