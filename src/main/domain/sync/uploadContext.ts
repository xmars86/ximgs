import { AppError } from '@shared/errors'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import { createS3Client } from '@main/providers/s3'
import {
  createB2S3Client,
  resolveB2Config,
  type B2ResolvedConfig
} from '@main/providers/backblaze'
import { createR2S3Client, resolveR2Config } from '@main/providers/r2'
import { createRegionalClient, resolveRegionalConfig } from '@main/providers/regional'
import { isRegionalProvider } from '@shared/regional'
import type { S3Client } from '@aws-sdk/client-s3'
import { assertReadyToTestConnection } from './validate'

export interface UploadContext {
  client: S3Client
  b2: B2ResolvedConfig | null
  prefix: string
  bucket: string
  publicBaseUrl: string
}

/** Shared client context for folder sync and single uploads. */
export function createUploadContext(secret: string): UploadContext {
  const settings = getSyncSettings()
  assertReadyToTestConnection(settings)

  if (settings.provider === 'b2') {
    const b2 = resolveB2Config({
      keyId: settings.accessKeyId,
      applicationKey: secret,
      bucketName: settings.bucket,
      region: settings.region,
      endpoint: settings.endpoint,
      publicBaseUrl: settings.publicBaseUrl,
      keyPrefix: settings.objectPrefix,
      sseMode: settings.sseMode
    })
    return {
      client: createB2S3Client(b2),
      b2,
      prefix: b2.keyPrefix,
      bucket: b2.bucketName,
      publicBaseUrl: b2.publicBaseUrl
    }
  }

  if (isRegionalProvider(settings.provider)) {
    const regional = resolveRegionalConfig(settings.provider, {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: secret,
      bucketName: settings.bucket,
      region: settings.region,
      endpoint: settings.endpoint,
      publicBaseUrl: settings.publicBaseUrl,
      keyPrefix: settings.objectPrefix
    })
    return {
      client: createRegionalClient(regional),
      b2: null,
      prefix: regional.keyPrefix,
      bucket: regional.bucketName,
      publicBaseUrl: regional.publicBaseUrl
    }
  }

  if (settings.provider === 'r2') {
    const r2 = resolveR2Config({
      accessKeyId: settings.accessKeyId,
      secretAccessKey: secret,
      bucketName: settings.bucket,
      region: settings.region,
      endpoint: settings.endpoint,
      publicBaseUrl: settings.publicBaseUrl,
      keyPrefix: settings.objectPrefix
    })
    return {
      client: createR2S3Client(r2),
      b2: null,
      prefix: r2.keyPrefix,
      bucket: r2.bucketName,
      publicBaseUrl: r2.publicBaseUrl
    }
  }

  if (!settings.bucket.trim() || !settings.accessKeyId.trim() || !settings.endpoint.trim()) {
    throw new AppError(
      'S3_CONFIG_INCOMPLETE',
      '配置未完成，无法上传：\n- 请填写 Endpoint、Bucket、Access Key ID 与 Secret'
    )
  }

  return {
    client: createS3Client({
      endpoint: settings.endpoint,
      region: settings.region || 'auto',
      bucket: settings.bucket,
      accessKeyId: settings.accessKeyId,
      secretAccessKey: secret,
      forcePathStyle: Boolean(settings.endpoint.trim())
    }),
    b2: null,
    prefix: settings.objectPrefix,
    bucket: settings.bucket,
    publicBaseUrl: settings.publicBaseUrl
  }
}
