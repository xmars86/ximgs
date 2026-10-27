import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import { AppError } from '@shared/errors'
import { buildPublicUrl } from '@shared/publicUrl'
import { createS3Client, putObjectFile, type S3UploadConfig } from './s3'

export type B2SseMode = '' | 'AES256'

export interface B2ConfigInput {
  keyId: string
  applicationKey: string
  bucketName: string
  region: string
  endpoint?: string
  publicBaseUrl: string
  keyPrefix?: string
  sseMode?: B2SseMode | string
  timeoutMs?: number
}

export interface B2ResolvedConfig {
  keyId: string
  applicationKey: string
  bucketName: string
  region: string
  endpoint: string
  publicBaseUrl: string
  keyPrefix: string
  sseMode: B2SseMode
  timeoutMs: number
}

/** Derive https://s3.<region>.backblazeb2.com when endpoint is empty. */
export function deriveB2Endpoint(region: string, endpoint?: string): string {
  const explicit = (endpoint ?? '').trim().replace(/\/+$/, '')
  if (explicit) {
    return explicit
  }
  const r = region.trim()
  if (!r) {
    return ''
  }
  return `https://s3.${r}.backblazeb2.com`
}

export function normalizeKeyPrefix(prefix: string | undefined): string {
  let p = (prefix ?? '').trim().replace(/^\/+/, '')
  if (p && !p.endsWith('/')) {
    p = `${p}/`
  }
  return p
}

/**
 * Validate & normalize B2 settings (mirrors python-vue-web B2Config.validate).
 * Does not embed any credentials.
 */
export function resolveB2Config(input: B2ConfigInput): B2ResolvedConfig {
  const keyId = input.keyId.trim()
  const applicationKey = input.applicationKey.trim()
  const bucketName = input.bucketName.trim()
  const region = input.region.trim()
  const publicBaseUrl = input.publicBaseUrl.trim().replace(/\/+$/, '')
  const endpoint = deriveB2Endpoint(region, input.endpoint)
  const sseRaw = (input.sseMode ?? '').trim().toUpperCase()
  const sseMode: B2SseMode = sseRaw === 'AES256' ? 'AES256' : ''
  const timeoutMs =
    input.timeoutMs && input.timeoutMs > 0 ? Math.round(input.timeoutMs) : 30_000

  if (!keyId || !applicationKey) {
    throw new AppError('B2_CONFIG', '缺少 B2 凭证：请填写 Key ID 与 Application Key')
  }
  // Short keyID usually means user swapped keyId / applicationKey
  if (keyId.length < 16) {
    throw new AppError(
      'B2_KEY_ID_INVALID',
      'Key ID 长度异常（疑似填错）：请到 B2 控制台复制完整 Application Key ID，不要与 Application Key 搞反'
    )
  }
  if (sseRaw && sseRaw !== 'AES256') {
    throw new AppError('B2_SSE_INVALID', 'SSE 仅支持空或 AES256（SSE-B2）')
  }
  if (!bucketName) {
    throw new AppError('B2_CONFIG', '缺少桶名 Bucket')
  }
  if (!region) {
    throw new AppError('B2_CONFIG', '缺少区域 Region（须与桶所在区域一致）')
  }
  if (!endpoint) {
    throw new AppError('B2_CONFIG', '缺少 Endpoint（可填 Region 自动生成）')
  }
  if (!publicBaseUrl) {
    throw new AppError(
      'B2_CONFIG',
      '缺少公开访问根 Public Base URL（如 https://f005.backblazeb2.com/file/<bucket> 或 CDN 域名）'
    )
  }

  return {
    keyId,
    applicationKey,
    bucketName,
    region,
    endpoint,
    publicBaseUrl,
    keyPrefix: normalizeKeyPrefix(input.keyPrefix),
    sseMode,
    timeoutMs
  }
}

export function createB2S3Client(config: B2ResolvedConfig): S3Client {
  const upload: S3UploadConfig = {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucketName,
    accessKeyId: config.keyId,
    secretAccessKey: config.applicationKey,
    forcePathStyle: true,
    timeoutMs: config.timeoutMs,
    maxAttempts: 3
  }
  return createS3Client(upload)
}

export async function putB2ObjectFile(
  client: S3Client,
  config: B2ResolvedConfig,
  objectKey: string,
  filePath: string
): Promise<void> {
  await putObjectFile(client, config.bucketName, objectKey, filePath, {
    serverSideEncryption: config.sseMode === 'AES256' ? 'AES256' : undefined
  })
}

export async function testB2Connection(config: B2ResolvedConfig): Promise<{ ok: true }> {
  const client = createB2S3Client(config)
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }))
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError('B2_CONNECTION_FAILED', `B2 连接失败：${message}`, { cause: error })
  } finally {
    client.destroy()
  }
}

export function b2PublicUrl(publicBaseUrl: string, objectKey: string): string {
  return buildPublicUrl(publicBaseUrl, objectKey)
}
