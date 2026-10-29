import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const getSyncSettings = vi.fn()
const logWarn = vi.fn()
const logInfo = vi.fn()
const userDataRoot = mkdtempSync(join(tmpdir(), 'ximgs-mirror-ud-'))

vi.mock('../../src/main/db/repos/syncSettings', () => ({
  getSyncSettings: () => getSyncSettings()
}))

vi.mock('../../src/main/runtime/logger', () => ({
  log: {
    info: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logWarn(...args),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataRoot : join(userDataRoot, name))
  }
}))

import {
  clearPendingMirrorRetries,
  copyUploadToWatchFolder,
  MIRROR_RETRY_DELAYS_MS,
  scheduleMirrorToWatchFolder
} from '../../src/main/domain/sync/mirrorLocal'

describe('copyUploadToWatchFolder', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ximgs-mirror-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('copies into watchFolder/relativePath and creates parent dirs', () => {
    const src = join(root, 'src.jpg')
    writeFileSync(src, 'hello-image')
    const watch = join(root, 'watch')
    mkdirSync(watch)

    const result = copyUploadToWatchFolder(src, 'images/2026/10/a.jpg', watch)
    expect(result).toBe('ok')
    const dest = join(watch, 'images', '2026', '10', 'a.jpg')
    expect(readFileSync(dest, 'utf8')).toBe('hello-image')
  })

  it('skips when source is already the destination path', () => {
    const watch = join(root, 'watch')
    const dest = join(watch, 'keep', 'same.jpg')
    mkdirSync(join(watch, 'keep'), { recursive: true })
    writeFileSync(dest, 'same')

    expect(copyUploadToWatchFolder(dest, 'keep/same.jpg', watch)).toBe('skip')
  })

  it('returns no_watch when watch folder empty', () => {
    const src = join(root, 'src.jpg')
    writeFileSync(src, 'x')
    expect(copyUploadToWatchFolder(src, 'a.jpg', '  ')).toBe('no_watch')
  })
})

describe('scheduleMirrorToWatchFolder retries', () => {
  let work: string

  beforeEach(() => {
    vi.useFakeTimers()
    logWarn.mockClear()
    logInfo.mockClear()
    clearPendingMirrorRetries()
    work = mkdtempSync(join(tmpdir(), 'ximgs-mirror-job-'))
  })

  afterEach(() => {
    clearPendingMirrorRetries()
    vi.useRealTimers()
    rmSync(work, { recursive: true, force: true })
  })

  afterAll(() => {
    rmSync(userDataRoot, { recursive: true, force: true })
  })

  it('mirrors immediately when watch folder is writable', () => {
    const watch = join(work, 'watch')
    mkdirSync(watch)
    const src = join(work, 'pick.png')
    writeFileSync(src, 'png-bytes')
    getSyncSettings.mockReturnValue({ watchFolder: watch })

    scheduleMirrorToWatchFolder(src, 'products/ASIN/cover.png')

    expect(readFileSync(join(watch, 'products', 'ASIN', 'cover.png'), 'utf8')).toBe('png-bytes')
  })

  it('retries 3 times then warns without throwing when copy keeps failing', async () => {
    const src = join(work, 'pick.png')
    writeFileSync(src, 'png-bytes')
    getSyncSettings.mockReturnValue({ watchFolder: join(work, 'watch') })
    mkdirSync(join(work, 'watch'))

    scheduleMirrorToWatchFolder(src, '../escape.png')

    for (const delay of MIRROR_RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay)
    }

    const gaveUp = logWarn.mock.calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('gave up after retries')
    )
    expect(gaveUp).toBe(true)
  })

  it('warns and skips when watch folder is not configured', () => {
    const src = join(work, 'pick.png')
    writeFileSync(src, 'png-bytes')
    getSyncSettings.mockReturnValue({ watchFolder: null })

    scheduleMirrorToWatchFolder(src, 'images/2026/10/a.png')

    const skipped = logWarn.mock.calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('watch folder not configured')
    )
    expect(skipped).toBe(true)
  })
})
