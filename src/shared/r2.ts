/** Cloudflare account IDs are 32 hex characters. */
const ACCOUNT_ID_RE = /^[a-f0-9]{32}$/i

/**
 * Pull the account id from a bare id or an R2 S3 endpoint.
 * Jurisdiction hosts (`<id>.eu.r2.cloudflarestorage.com`) are accepted.
 */
export function parseR2AccountId(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  if (ACCOUNT_ID_RE.test(raw)) return raw.toLowerCase()
  try {
    const host = new URL(raw).hostname.toLowerCase()
    const match = host.match(/^([a-f0-9]{32})(?:\.[a-z0-9-]+)?\.r2\.cloudflarestorage\.com$/)
    return match?.[1] ?? ''
  } catch {
    return ''
  }
}

/**
 * Build `https://<accountId>.r2.cloudflarestorage.com`.
 * An explicit https endpoint wins (needed for EU / fedramp jurisdiction hosts).
 * A bare 32-char account id in `endpoint` is expanded the same way.
 */
export function deriveR2Endpoint(accountId: string, endpoint?: string): string {
  const explicit = (endpoint ?? '').trim().replace(/\/+$/, '')
  if (explicit) {
    if (ACCOUNT_ID_RE.test(explicit)) {
      return `https://${explicit.toLowerCase()}.r2.cloudflarestorage.com`
    }
    return explicit
  }
  const id = accountId.trim().toLowerCase()
  if (!ACCOUNT_ID_RE.test(id)) return ''
  return `https://${id}.r2.cloudflarestorage.com`
}
