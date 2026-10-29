import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import { AppError } from '@shared/errors'
import {
  deriveRegionalEndpoint,
  deriveRegionalPublicBase,
  isCosBucketName,
  signingRegion,
  type RegionalProviderId
} from '@shared/regional'
import { normalizeKeyPrefix } from './backblaze'
import { createS3Client, type S3UploadConfig } from './s3'

const LABEL: Record<RegionalProviderId, string> = {
  aws: 'AWS S3',
  oss: '阿里云 OSS',
  cos: '腾讯云 COS',
  qiniu: '七牛云 Kodo'
}

export interface RegionalConfigInput {
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  region: string
  endpoint?: string
  publicBaseUrl: string
  keyPrefix?: string
  timeoutMs?: number
}

export interface RegionalResolvedConfig {
  provider: RegionalProviderId
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  region: string
  endpoint: string
  publicBaseUrl: string
  keyPrefix: string
  timeoutMs: number
}

export function resolveRegionalConfig(
  provider: RegionalProviderId,
  input: RegionalConfigInput
): RegionalResolvedConfig {
  const accessKeyId = input.accessKeyId.trim()
  const secretAccessKey = input.secretAccessKey.trim()
  const bucketName = input.bucketName.trim()
  const regionInput = input.region.trim()
  const endpoint = deriveRegionalEndpoint(provider, regionInput, input.endpoint)
  const region = signingRegion(provider, regionInput)
  const publicBaseUrl = deriveRegionalPublicBase(
    provider,
    bucketName,
    regionInput,
    input.publicBaseUrl
  )
  const timeoutMs =
    input.timeoutMs && input.timeoutMs > 0 ? Math.round(input.timeoutMs) : 30_000
  const name = LABEL[provider]

  if (!accessKeyId || !secretAccessKey) {
    throw new AppError('STORAGE_CONFIG', `缺少 ${name} 凭证：请填写 Access Key ID 与 Secret Access Key`)
  }
  if (!regionInput || !region) {
    throw new AppError('STORAGE_CONFIG', `缺少 ${name} Region`)
  }
  if (!bucketName) {
    throw new AppError('STORAGE_CONFIG', `缺少 ${name} 桶名 Bucket`)
  }
  if (provider === 'cos' && !isCosBucketName(bucketName)) {
    throw new AppError(
      'COS_BUCKET_INVALID',
      '腾讯云 COS 桶名需为 bucketname-APPID，例如 images-1250000000'
    )
  }
  if (!endpoint) {
    throw new AppError('STORAGE_CONFIG', `缺少 ${name} Endpoint（可填 Region 后自动生成）`)
  }
  if (!publicBaseUrl) {
    throw new AppError(
      'STORAGE_CONFIG',
      provider === 'qiniu'
        ? '缺少七牛公开访问根：请填写测试域名或 CDN / 自定义域名（S3 Endpoint 不可匿名访问）'
        : `缺少 ${name} 公开访问根（留空将使用桶默认域名，或填写 CDN / 自定义域名）`
    )
  }

  return {
    provider,
    accessKeyId,
    secretAccessKey,
    bucketName,
    region,
    endpoint,
    publicBaseUrl,
    keyPrefix: normalizeKeyPrefix(input.keyPrefix),
    timeoutMs
  }
}

export function createRegionalClient(config: RegionalResolvedConfig): S3Client {
  // Non-AWS S3 APIs often reject default CRC32 checksum headers from recent AWS SDK v3.
  const checksum =
    config.provider === 'aws'
      ? undefined
      : ({
          requestChecksumCalculation: 'WHEN_REQUIRED' as const,
          responseChecksumValidation: 'WHEN_REQUIRED' as const
        } satisfies Pick<
          S3UploadConfig,
          'requestChecksumCalculation' | 'responseChecksumValidation'
        >)

  return createS3Client({
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucketName,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    forcePathStyle: false,
    timeoutMs: config.timeoutMs,
    maxAttempts: 3,
    ...checksum
  })
}

export async function testRegionalConnection(
  config: RegionalResolvedConfig
): Promise<{ ok: true }> {
  const client = createRegionalClient(config)
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }))
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError(
      'STORAGE_CONNECTION_FAILED',
      `${LABEL[config.provider]} 连接失败：${message}`,
      { cause: error }
    )
  } finally {
    client.destroy()
  }
}
