import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/domain/sync/secrets', () => ({
  hasSyncSecret: vi.fn(() => false)
}))

import { hasSyncSecret } from '../../src/main/domain/sync/secrets'
import { buildSetupChecklist } from '../../src/main/domain/sync/validate'
import type { SyncSettingsRow } from '../../src/main/db/repos/syncSettings'

const base: SyncSettingsRow = {
  watchFolder: null,
  intervalMinutes: 5,
  autoStart: false,
  objectPrefix: '',
  provider: 'b2',
  endpoint: '',
  region: '',
  bucket: '',
  publicBaseUrl: '',
  accessKeyId: '',
  sseMode: ''
}

describe('buildSetupChecklist', () => {
  it('lists missing B2 fields', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(false)
    const checklist = buildSetupChecklist(base)
    expect(checklist.readyToSync).toBe(false)
    expect(checklist.missing.some((m) => m.includes('监控目录'))).toBe(true)
    expect(checklist.missing.some((m) => m.includes('Region'))).toBe(true)
    expect(checklist.missing.some((m) => m.includes('Application Key'))).toBe(true)
  })

  it('is ready when complete', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(true)
    const checklist = buildSetupChecklist({
      ...base,
      watchFolder: 'D:/pics',
      region: 'eu-central-003',
      bucket: 'quickimg',
      publicBaseUrl: 'https://cdn.example.com',
      accessKeyId: '0030f1a647a72cc0000000001'
    })
    expect(checklist.readyToSync).toBe(true)
    expect(checklist.missing).toEqual([])
  })
})
