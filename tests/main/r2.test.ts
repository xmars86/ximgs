import { describe, expect, it, vi } from 'vitest'
import { deriveR2Endpoint, parseR2AccountId } from '../../src/shared/r2'

vi.mock('../../src/main/domain/sync/secrets', () => ({
  hasSyncSecret: vi.fn(() => true)
}))

import { hasSyncSecret } from '../../src/main/domain/sync/secrets'
import { buildSetupChecklist } from '../../src/main/domain/sync/validate'
import type { SyncSettingsRow } from '../../src/main/db/repos/syncSettings'

const ACCOUNT = 'a1b2c3d4e5f6789012345678abcdef01'

describe('R2 endpoint', () => {
  it('builds the default S3 endpoint from an account id', () => {
    expect(deriveR2Endpoint(ACCOUNT)).toBe(
      `https://${ACCOUNT}.r2.cloudflarestorage.com`
    )
    expect(deriveR2Endpoint('', ACCOUNT)).toBe(
      `https://${ACCOUNT}.r2.cloudflarestorage.com`
    )
  })

  it('keeps an explicit jurisdiction endpoint', () => {
    const eu = `https://${ACCOUNT}.eu.r2.cloudflarestorage.com`
    expect(deriveR2Endpoint(ACCOUNT, eu)).toBe(eu)
    expect(parseR2AccountId(eu)).toBe(ACCOUNT)
  })

  it('rejects a short account id', () => {
    expect(deriveR2Endpoint('abc')).toBe('')
    expect(parseR2AccountId('not-an-id')).toBe('')
  })
})

describe('R2 checklist', () => {
  const base: SyncSettingsRow = {
    watchFolder: 'D:/pics',
    intervalMinutes: 60,
    autoStart: false,
    objectPrefix: '',
    provider: 'r2',
    endpoint: '',
    region: 'auto',
    bucket: '',
    publicBaseUrl: '',
    accessKeyId: '',
    sseMode: ''
  }

  it('lists missing R2 fields', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(false)
    const checklist = buildSetupChecklist(base)
    expect(checklist.readyToSync).toBe(false)
    expect(checklist.missing.some((m) => m.includes('Account ID'))).toBe(true)
    expect(checklist.missing.some((m) => m.includes('Secret Access Key'))).toBe(true)
  })

  it('is ready with endpoint, bucket, public URL, and keys', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(true)
    const checklist = buildSetupChecklist({
      ...base,
      endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      bucket: 'ximgs',
      publicBaseUrl: 'https://img.example.com',
      accessKeyId: 'r2accesskeyid0123456789abcdef'
    })
    expect(checklist.readyToSync).toBe(true)
    expect(checklist.provider).toBe('r2')
  })
})
