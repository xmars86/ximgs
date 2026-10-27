/**
 * Real B2 smoke: PutObject → build public URL → HTTP GET.
 * Credentials from env or .env.local (never commit secrets).
 *
 *   pnpm smoke:b2
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i <= 0) continue
    const key = trimmed.slice(0, i).trim()
    let value = trimmed.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(join(process.cwd(), '.env.local'))

const keyId = (process.env.B2_KEY_ID || '').trim()
const appKey = (process.env.B2_APPLICATION_KEY || '').trim()
const bucket = (process.env.B2_BUCKET || '').trim()
const region = (process.env.B2_REGION || '').trim()
const endpoint = (
  process.env.B2_ENDPOINT || (region ? `https://s3.${region}.backblazeb2.com` : '')
).trim()
const publicBase = (process.env.B2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
const prefix = (process.env.B2_KEY_PREFIX || 'ximgs-smoke/').replace(/^\/+/, '')

function fail(msg) {
  console.error(`[smoke-b2] ${msg}`)
  process.exit(1)
}

if (!keyId || !appKey || !bucket || !region || !endpoint || !publicBase) {
  fail(
    'Missing env. Copy .env.example → .env.local and fill B2_* vars, then re-run pnpm smoke:b2'
  )
}
if (keyId.length < 16) {
  fail('B2_KEY_ID looks too short (did you swap Key ID / Application Key?)')
}

const require = createRequire(import.meta.url)
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')

const dir = mkdtempSync(join(tmpdir(), 'ximgs-smoke-'))
const filePath = join(dir, 'ping.png')
// Minimal 1x1 PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
writeFileSync(filePath, png)

const objectKey = `${prefix}ping-${Date.now()}.png`
const publicUrl = `${publicBase}/${objectKey}`

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: keyId, secretAccessKey: appKey }
})

console.log('[smoke-b2] uploading', { bucket, endpoint, objectKey })

try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: png,
      ContentType: 'image/png'
    })
  )
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }))
  console.log('[smoke-b2] put+head ok')

  const res = await fetch(publicUrl, { method: 'GET' })
  console.log('[smoke-b2] public GET', res.status, publicUrl)
  if (!res.ok) {
    fail(`Public URL not reachable (HTTP ${res.status}). Check bucket public access / CDN / PUBLIC_BASE_URL.`)
  }
  console.log('[smoke-b2] SUCCESS')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  client.destroy()
}

void pathToFileURL
