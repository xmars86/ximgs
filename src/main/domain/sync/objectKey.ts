/** Build stable S3 object key from optional prefix + posix relative path. */
export function buildObjectKey(objectPrefix: string, relativePath: string): string {
  const posixRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const prefix = objectPrefix.trim().replace(/^\/+|\/+$/g, '')
  if (!prefix) {
    return posixRel
  }
  return `${prefix}/${posixRel}`
}

export { encodeObjectKeyForUrl, buildPublicUrl } from '@shared/publicUrl'
