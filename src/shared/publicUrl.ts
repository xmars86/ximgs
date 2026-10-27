/**
 * Encode object-key path segments for a browser-safe public URL.
 * Keeps `/` as separators; encodes `+`, spaces, CJK, etc. (`A+` → `A%2B`).
 */
export function encodeObjectKeyForUrl(objectKey: string): string {
  return objectKey
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => {
      if (!segment) return ''
      try {
        // Avoid double-encoding if a segment is already percent-encoded.
        return encodeURIComponent(decodeURIComponent(segment))
      } catch {
        return encodeURIComponent(segment)
      }
    })
    .join('/')
}

export function buildPublicUrl(publicBaseUrl: string, objectKey: string): string {
  const base = publicBaseUrl.trim().replace(/\/+$/, '')
  const key = encodeObjectKeyForUrl(objectKey)
  if (!base) {
    return key
  }
  if (!key) {
    return base
  }
  return `${base}/${key}`
}
