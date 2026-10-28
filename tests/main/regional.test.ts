import { describe, expect, it, vi } from 'vitest'
import {
  deriveRegionalEndpoint,
  deriveRegionalPublicBase,
  isCosBucketName,
  normalizeOssRegion,
  signingRegion
} from '../../src/shared/regional'

vi.mock('../../src/main/domain/sync/secrets', () => ({
  hasSyncSecret: vi.fn(() => true)
}))

import { hasSyncSecret } from '../../src/main/domain/sync/secrets'
import { buildSetupChecklist } from '../../src/main/domain/sync/validate'
import type { SyncSettingsRow } from '../../src/main/db/repos/syncSettings'

const base: SyncSettingsRow = {
  watchFolder: 'D:/pics',
  intervalMinutes: 60,
  autoStart: false,
  objectPrefix: '',
  provider: 'aws',
  endpoint: '',
  region: '',
  bucket: '',
  publicBaseUrl: '',
  accessKeyId: '',
  sseMode: ''
}

describe('regional endpoints', () => {
  it('builds AWS endpoints, including China regions', () => {
    expect(deriveRegionalEndpoint('aws', 'ap-southeast-1')).toBe(
      'https://s3.ap-southeast-1.amazonaws.com'
    )
    expect(deriveRegionalEndpoint('aws', 'cn-north-1')).toBe(
      'https://s3.cn-north-1.amazonaws.com.cn'
    )
    expect(deriveRegionalPublicBase('aws', 'imgs', 'ap-southeast-1')).toBe(
      'https://imgs.s3.ap-southeast-1.amazonaws.com'
    )
  })

  it('normalizes Aliyun regions without doubling the oss- prefix', () => {
    expect(normalizeOssRegion('cn-hangzhou')).toBe('oss-cn-hangzhou')
    expect(normalizeOssRegion('oss-cn-hangzhou')).toBe('oss-cn-hangzhou')
    expect(signingRegion('oss', 'cn-hangzhou')).toBe('oss-cn-hangzhou')
    expect(deriveRegionalEndpoint('oss', 'cn-hangzhou')).toBe(
      'https://oss-cn-hangzhou.aliyuncs.com'
    )
    expect(deriveRegionalPublicBase('oss', 'imgs', 'cn-hangzhou')).toBe(
      'https://imgs.oss-cn-hangzhou.aliyuncs.com'
    )
  })

  it('builds Tencent COS hosts and keeps an explicit endpoint', () => {
    expect(deriveRegionalEndpoint('cos', 'ap-guangzhou')).toBe(
      'https://cos.ap-guangzhou.myqcloud.com'
    )
    expect(deriveRegionalPublicBase('cos', 'imgs-1250000000', 'ap-guangzhou')).toBe(
      'https://imgs-1250000000.cos.ap-guangzhou.myqcloud.com'
    )
    expect(
      deriveRegionalEndpoint('cos', 'ap-guangzhou', 'https://cos.ap-guangzhou.myqcloud.com')
    ).toBe('https://cos.ap-guangzhou.myqcloud.com')
    expect(isCosBucketName('imgs-1250000000')).toBe(true)
    expect(isCosBucketName('imgs')).toBe(false)
  })
})

describe('regional checklist', () => {
  it('is ready for AWS when region, bucket, and keys exist', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(true)
    const checklist = buildSetupChecklist({
      ...base,
      region: 'ap-southeast-1',
      bucket: 'imgs',
      accessKeyId: 'AKIAexamplekey'
    })
    expect(checklist.readyToSync).toBe(true)
    expect(checklist.provider).toBe('aws')
  })

  it('requires the COS bucket APPID suffix', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(true)
    const checklist = buildSetupChecklist({
      ...base,
      provider: 'cos',
      region: 'ap-guangzhou',
      bucket: 'imgs',
      accessKeyId: 'AKIDexamplekey'
    })
    expect(checklist.readyToSync).toBe(false)
    expect(checklist.missing.some((m) => m.includes('APPID'))).toBe(true)
  })

  it('accepts a complete OSS setup', () => {
    vi.mocked(hasSyncSecret).mockReturnValue(true)
    const checklist = buildSetupChecklist({
      ...base,
      provider: 'oss',
      region: 'cn-hongkong',
      bucket: 'imgs',
      accessKeyId: 'LTAIexamplekey'
    })
    expect(checklist.readyToSync).toBe(true)
  })
})
