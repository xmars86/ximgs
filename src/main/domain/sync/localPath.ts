import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Resolve a sync relative path under the watch folder.
 * Rejects traversal. Safe for Windows drive letters and UNC roots
 * (Node's resolve() may keep a trailing sep on UNC shares).
 */
export function resolveLocalMediaPath(
  watchFolder: string,
  relativePath: string
): string | null {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!rel || rel.split('/').some((part) => part === '..' || part === '.' || !part)) {
    return null
  }

  const rootAbs = resolve(watchFolder)
  const abs = resolve(rootAbs, ...rel.split('/'))
  const relToRoot = relative(rootAbs, abs)

  // Empty means the path is the root itself (not a file under it).
  if (!relToRoot || relToRoot === '.') return null
  if (relToRoot === '..' || relToRoot.startsWith(`..${sep}`)) return null
  // Windows: relative() can yield a leading-\ path which isAbsolute() treats as absolute.
  if (isAbsolute(relToRoot)) return null
  if (relToRoot.split(/[/\\]/).includes('..')) return null

  return abs
}
