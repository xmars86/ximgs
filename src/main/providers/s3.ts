import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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
    })
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
