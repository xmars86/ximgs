/** Object storage provider adapters. */
export type StorageProviderId = 'r2' | 'b2' | 'oss' | 'qiniu' | 's3' | 'cos' | 'minio'

export {
  createS3Client,
  deleteObjectFile,
  isRemoteObjectMissingError,
  putObjectFile
} from './s3'
export {
  createB2S3Client,
  deriveB2Endpoint,
  putB2ObjectFile,
  resolveB2Config,
  testB2Connection
} from './backblaze'
export { createR2S3Client, putR2ObjectFile, resolveR2Config, testR2Connection } from './r2'
export {
  createRegionalClient,
  resolveRegionalConfig,
  testRegionalConnection
} from './regional'
