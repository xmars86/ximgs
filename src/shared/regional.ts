export type RegionalProviderId = 'aws' | 'oss' | 'cos' | 'qiniu'

export function isRegionalProvider(value: string): value is RegionalProviderId {
  return value === 'aws' || value === 'oss' || value === 'cos' || value === 'qiniu'
}

/** Console region `cn-hangzhou` and SDK region `oss-cn-hangzhou` both normalize to the latter. */
export function normalizeOssRegion(region: string): string {
  const raw = region.trim().toLowerCase()
  if (!raw) return ''
  return raw.startsWith('oss-') ? raw : `oss-${raw}`
}

function explicitUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '')
}

export function deriveRegionalEndpoint(
  provider: RegionalProviderId,
  region: string,
  endpoint?: string
): string {
  const explicit = explicitUrl(endpoint)
  if (explicit) return explicit
  const raw = region.trim()
  if (!raw) return ''

  if (provider === 'aws') {
    const id = raw.toLowerCase()
    if (id === 'cn-north-1' || id === 'cn-northwest-1') {
      return `https://s3.${id}.amazonaws.com.cn`
    }
    return `https://s3.${id}.amazonaws.com`
  }

  if (provider === 'oss') {
    return `https://${normalizeOssRegion(raw)}.aliyuncs.com`
  }

  if (provider === 'qiniu') {
    return `https://s3.${raw.toLowerCase()}.qiniucs.com`
  }

  return `https://cos.${raw.toLowerCase()}.myqcloud.com`
}

/** Signing region passed to the AWS SDK. OSS expects the `oss-` prefix. */
export function signingRegion(provider: RegionalProviderId, region: string): string {
  const raw = region.trim()
  if (provider === 'oss') return normalizeOssRegion(raw)
  return raw.toLowerCase()
}

export function deriveRegionalPublicBase(
  provider: RegionalProviderId,
  bucket: string,
  region: string,
  publicBaseUrl?: string
): string {
  const explicit = explicitUrl(publicBaseUrl)
  if (explicit) return explicit
  const name = bucket.trim()
  const raw = region.trim()
  if (!name || !raw) return ''

  // Qiniu S3 endpoints reject anonymous GETs — public URLs must use CDN / test domain.
  if (provider === 'qiniu') return ''

  if (provider === 'aws') {
    const id = raw.toLowerCase()
    if (id === 'cn-north-1' || id === 'cn-northwest-1') {
      return `https://${name}.s3.${id}.amazonaws.com.cn`
    }
    return `https://${name}.s3.${id}.amazonaws.com`
  }

  if (provider === 'oss') {
    return `https://${name}.${normalizeOssRegion(raw)}.aliyuncs.com`
  }

  return `https://${name}.cos.${raw.toLowerCase()}.myqcloud.com`
}

/** COS bucket names are `<name>-<APPID>`. */
export function isCosBucketName(bucket: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,48}-\d{6,}$/i.test(bucket.trim())
}
