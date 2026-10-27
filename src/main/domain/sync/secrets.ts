import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { getSecretsDir } from '@main/runtime/paths'
import { log } from '@main/runtime/logger'

const SECRET_FILE = 'sync-s3-secret.bin'

function secretPath(): string {
  return join(getSecretsDir(), SECRET_FILE)
}

export function hasSyncSecret(): boolean {
  return existsSync(secretPath())
}

export function saveSyncSecret(secretAccessKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('safeStorage unavailable; writing secret with base64 fallback (dev only)')
    writeFileSync(secretPath(), Buffer.from(secretAccessKey, 'utf8').toString('base64'), 'utf8')
    return
  }
  const encrypted = safeStorage.encryptString(secretAccessKey)
  writeFileSync(secretPath(), encrypted)
}

export function loadSyncSecret(): string | null {
  const path = secretPath()
  if (!existsSync(path)) {
    return null
  }
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      const raw = readFileSync(path, 'utf8')
      return Buffer.from(raw, 'base64').toString('utf8')
    }
    const buf = readFileSync(path)
    return safeStorage.decryptString(buf)
  } catch (error) {
    log.warn('Failed to decrypt sync secret', error)
    return null
  }
}

export function clearSyncSecret(): void {
  const path = secretPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}
