import type { SyncProviderId, SyncSetupChecklist } from '@shared/sync'
import { AppError } from '@shared/errors'
import { deriveB2Endpoint } from '@main/providers/backblaze'
import { hasSyncSecret } from './secrets'
import type { SyncSettingsRow } from '@main/db/repos/syncSettings'

export function buildSetupChecklist(settings: SyncSettingsRow): SyncSetupChecklist {
  const missing: string[] = []
  const hasWatchFolder = Boolean(settings.watchFolder?.trim())
  if (!hasWatchFolder) {
    missing.push('未选择监控目录')
  }

  const hasKey = Boolean(settings.accessKeyId.trim())
  const hasBucket = Boolean(settings.bucket.trim())
  const hasRegion = Boolean(settings.region.trim())
  const hasPublic = Boolean(settings.publicBaseUrl.trim())
  const hasSecret = hasSyncSecret()
  const endpoint =
    settings.endpoint.trim() ||
    (settings.provider === 'b2' ? deriveB2Endpoint(settings.region) : '')

  if (settings.provider === 'b2') {
    if (!hasRegion) missing.push('缺少 Region（例如 eu-central-003）')
    if (!endpoint) missing.push('缺少 Endpoint（可填 Region 后自动生成）')
    if (!hasBucket) missing.push('缺少 Bucket 桶名')
    if (!hasPublic) {
      missing.push(
        '缺少 Public Base URL（如 https://f005.backblazeb2.com/file/<bucket> 或 CDN）'
      )
    }
    if (!hasKey) missing.push('缺少 Key ID')
    if (!hasSecret) missing.push('缺少 Application Key（请填写并保存）')
    if (hasKey && settings.accessKeyId.trim().length < 16) {
      missing.push('Key ID 过短，可能与 Application Key 填反')
    }
  } else {
    if (!endpoint) missing.push('缺少 Endpoint（S3 兼容服务地址）')
    if (!hasBucket) missing.push('缺少 Bucket 桶名')
    if (!hasKey) missing.push('缺少 Access Key ID')
    if (!hasSecret) missing.push('缺少 Secret Access Key（请填写并保存）')
    if (!hasPublic) missing.push('缺少 Public Base URL（用于生成可访问链接）')
  }

  const providerMissing = missing.filter((m) => !m.includes('监控目录'))
  return {
    hasWatchFolder,
    hasProviderConfig: providerMissing.length === 0,
    hasSecret,
    hasPublicBaseUrl: hasPublic,
    readyToSync: hasWatchFolder && providerMissing.length === 0,
    missing,
    provider: settings.provider as SyncProviderId
  }
}

export function assertReadyToSync(settings: SyncSettingsRow): void {
  const checklist = buildSetupChecklist(settings)
  if (checklist.readyToSync) return
  throw new AppError(
    'SYNC_CONFIG_INCOMPLETE',
    `配置未完成，无法同步：\n- ${checklist.missing.join('\n- ')}`
  )
}

export function assertReadyToTestConnection(settings: SyncSettingsRow): void {
  const checklist = buildSetupChecklist(settings)
  const connectionMissing = checklist.missing.filter((m) => !m.includes('监控目录'))
  if (connectionMissing.length === 0) return
  throw new AppError(
    'SYNC_CONFIG_INCOMPLETE',
    `配置未完成，无法测试连接：\n- ${connectionMissing.join('\n- ')}`
  )
}
