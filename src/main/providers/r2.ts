import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import { AppError } from '@shared/errors'
import { deriveR2Endpoint, parseR2AccountId } from '@shared/r2'
import { normalizeKeyPrefix } from './backblaze'
import { createS3Client, putObjectFile, type S3UploadConfig } from './s3'

export interface R2ConfigInput {
  accountId?: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  endpoint?: string
  region?: string
  publicBaseUrl: string
  keyPrefix?: string
  timeoutMs?: number
}

export interface R2ResolvedConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  endpoint: string
  region: string
  publicBaseUrl: string
  keyPrefix: string
  timeoutMs: number
}

export function resolveR2Config(input: R2ConfigInput): R2ResolvedConfig {
  const accessKeyId = input.accessKeyId.trim()
  const secretAccessKey = input.secretAccessKey.trim()
  const bucketName = input.bucketName.trim()
  const publicBaseUrl = input.publicBaseUrl.trim().replace(/\/+$/, '')
  const endpoint = deriveR2Endpoint(input.accountId ?? '', input.endpoint)
  const accountId = parseR2AccountId(input.accountId ?? '') || parseR2AccountId(endpoint)
  const region = (input.region ?? '').trim() || 'auto'
  const timeoutMs =
    input.timeoutMs && input.timeoutMs > 0 ? Math.round(input.timeoutMs) : 30_000

  if (!accessKeyId || !secretAccessKey) {
    throw new AppError('R2_CONFIG', '缺少 R2 凭证：请填写 Access Key ID 与 Secret Access Key')
  }
  if (!bucketName) {
    throw new AppError('R2_CONFIG', '缺少桶名 Bucket')
  }
  if (!accountId || !endpoint.includes('r2.cloudflarestorage.com')) {
    throw new AppError(
      'R2_CONFIG',
      '缺少 Account ID（32 位）或 Endpoint（https://<Account ID>.r2.cloudflarestorage.com）'
    )
  }
  if (!publicBaseUrl) {
    throw new AppError(
      'R2_CONFIG',
      '缺少公开访问根 Public Base URL（自定义域名或 https://pub-xxxx.r2.dev）'
    )
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region,
    publicBaseUrl,
    keyPrefix: normalizeKeyPrefix(input.keyPrefix),
    timeoutMs
  }
}

export function createR2S3Client(config: R2ResolvedConfig): S3Client {
  // R2 rejects the default CRC32 checksum headers sent by recent AWS SDK v3.
  const upload: S3UploadConfig = {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucketName,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    forcePathStyle: true,
    timeoutMs: config.timeoutMs,
    maxAttempts: 3,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  }
  return createS3Client(upload)
}

export async function putR2ObjectFile(
  client: S3Client,
  config: R2ResolvedConfig,
  objectKey: string,
  filePath: string
): Promise<void> {
  await putObjectFile(client, config.bucketName, objectKey, filePath)
}

export async function testR2Connection(config: R2ResolvedConfig): Promise<{ ok: true }> {
  const client = createR2S3Client(config)
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }))
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError('R2_CONNECTION_FAILED', `R2 连接失败：${message}`, { cause: error })
  } finally {
    client.destroy()
  }
}
