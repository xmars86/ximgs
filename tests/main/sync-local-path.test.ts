import { describe, expect, it } from 'vitest'
import { resolveLocalMediaPath } from '../../src/main/domain/sync/localPath'

describe('resolveLocalMediaPath', () => {
  it('resolves files under a normal Windows drive root', () => {
    const abs = resolveLocalMediaPath('D:\\data\\ximgs', 'test/ximgs.jpeg')
    expect(abs?.toLowerCase().replace(/\//g, '\\')).toBe('d:\\data\\ximgs\\test\\ximgs.jpeg')
  })

  it('resolves files under a UNC watch folder (trailing-sep root)', () => {
    const abs = resolveLocalMediaPath('\\\\BETOHOW\\ximgs', 'test/ximgs.jpeg')
    expect(abs).toBeTruthy()
    expect(abs!.replace(/\//g, '\\').toLowerCase()).toContain('\\betohow\\ximgs\\test\\ximgs.jpeg')
  })

  it('resolves root-level files under UNC', () => {
    const abs = resolveLocalMediaPath('\\\\BETOHOW\\ximgs', 'ximgs.jpeg')
    expect(abs).toBeTruthy()
    expect(abs!.replace(/\//g, '\\').toLowerCase()).toMatch(/\\betohow\\ximgs\\ximgs\.jpeg$/)
  })

  it('rejects path traversal', () => {
    expect(resolveLocalMediaPath('D:\\data\\ximgs', '../secret.txt')).toBeNull()
    expect(resolveLocalMediaPath('D:\\data\\ximgs', 'a/../../secret.txt')).toBeNull()
  })
})
