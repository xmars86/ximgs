import { AppError } from '@shared/errors'
import { getSyncSettings } from '@main/db/repos/syncSettings'
import { createS3Client } from '@main/providers/s3'
import {
  createB2S3Client,
  resolveB2Config,
  type B2ResolvedConfig
} from '@main/providers/backblaze'
import type { S3Client } from '@aws-sdk/client-s3'
import { assertReadyToTestConnection } from './validate'

export interface UploadContext {
  client: S3Client
  b2: B2ResolvedConfig | null
  prefix: string
  bucket: string
  publicBaseUrl: string
}

/** Shared S3/B2 client context for folder sync and single uploads. */
export function createUploadContext(secret: string): UploadContext {
  const settings = getSyncSettings()
  assertReadyToTestConnection(settings)

  const useB2 = settings.provider !== 's3'
  const b2 = useB2
    ? resolveB2Config({
        keyId: settings.accessKeyId,
        applicationKey: secret,
        bucketName: settings.bucket,
        region: settings.region,
        endpoint: settings.endpoint,
        publicBaseUrl: settings.publicBaseUrl,
        keyPrefix: settings.objectPrefix,
        sseMode: settings.sseMode
      })
    : null

  if (!useB2) {
    if (!settings.bucket.trim() || !settings.accessKeyId.trim() || !settings.endpoint.trim()) {
      throw new AppError(
        'S3_CONFIG_INCOMPLETE',
        '配置未完成，无法上传：\n- 请填写 Endpoint、Bucket、Access Key ID 与 Secret'
      )
    }
  }

  const client = b2
    ? createB2S3Client(b2)
    : createS3Client({
        endpoint: settings.endpoint,
        region: settings.region || 'auto',
        bucket: settings.bucket,
        accessKeyId: settings.accessKeyId,
        secretAccessKey: secret,
        forcePathStyle: Boolean(settings.endpoint.trim())
      })

  return {
    client,
    b2,
    prefix: b2 ? b2.keyPrefix : settings.objectPrefix,
    bucket: b2 ? b2.bucketName : settings.bucket,
    publicBaseUrl: b2 ? b2.publicBaseUrl : settings.publicBaseUrl
  }
}
