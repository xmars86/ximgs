/** Object storage provider adapters. */
export type StorageProviderId = 'r2' | 'b2' | 'oss' | 'qiniu' | 's3' | 'cos' | 'minio'

export { createS3Client, putObjectFile } from './s3'
export {
  createB2S3Client,
  deriveB2Endpoint,
  putB2ObjectFile,
  resolveB2Config,
  testB2Connection
} from './backblaze'
