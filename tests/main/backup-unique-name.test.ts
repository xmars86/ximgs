import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { uniqueFileName } from '../../src/main/domain/backup'

describe('backup uniqueFileName', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('returns original when free', () => {
    dir = join(tmpdir(), `ximgs-bak-${Date.now()}`)
    mkdirSync(dir)
    expect(uniqueFileName(dir, 'a.jpg')).toBe('a.jpg')
  })

  it('increments on collision', () => {
    dir = join(tmpdir(), `ximgs-bak2-${Date.now()}`)
    mkdirSync(dir)
    writeFileSync(join(dir, 'a.jpg'), '1')
    expect(uniqueFileName(dir, 'a.jpg')).toBe('a_1.jpg')
  })
})
