import { describe, expect, it } from 'vitest'

/** Mirrors folder-name extraction used by browseSyncFiles. */
function childFolderNames(paths: string[], pathPrefix = ''): string[] {
  const counts = new Map<string, number>()
  const prefixLen = pathPrefix ? pathPrefix.length + 1 : 0
  for (const raw of paths) {
    const rel = raw.replace(/\\/g, '/')
    const rest = prefixLen ? rel.slice(prefixLen) : rel
    const slash = rest.indexOf('/')
    if (slash <= 0) continue
    const name = rest.slice(0, slash)
    if (!name || name === '.' || name === '..') continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.keys()].sort((a, b) => a.localeCompare(b, 'zh'))
}

function isDirectChild(relativePath: string, pathPrefix: string): boolean {
  const rel = relativePath.replace(/\\/g, '/')
  if (!pathPrefix) return !rel.includes('/')
  if (!rel.startsWith(`${pathPrefix}/`)) return false
  return !rel.slice(pathPrefix.length + 1).includes('/')
}

describe('sync browse path helpers', () => {
  const sample = [
    '25-AZLY-00878/套图/1600x1600/法语/全家福.jpg',
    '25-AZLY-00878/套图/1464x600/意大利语/4-3.jpg',
    '25-AZLY-00878/A+/x.jpg',
    'manual/2026/03/x.png',
    'root.jpg'
  ]

  it('lists root folders from relative paths', () => {
    expect(childFolderNames(sample)).toEqual(['25-AZLY-00878', 'manual'])
  })

  it('lists nested folders under a prefix', () => {
    expect(childFolderNames(sample, '25-AZLY-00878')).toEqual(['套图', 'A+'])
  })

  it('detects files directly in a folder', () => {
    expect(isDirectChild('25-AZLY-00878/A+/x.jpg', '25-AZLY-00878/A+')).toBe(true)
    expect(isDirectChild('25-AZLY-00878/套图/1600x1600/法语/全家福.jpg', '25-AZLY-00878')).toBe(
      false
    )
    expect(isDirectChild('root.jpg', '')).toBe(true)
  })
})
