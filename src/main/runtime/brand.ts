import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Resolve window / tray icon from resources/ximgs (dev + packaged). */
export function getAppIconPath(): string | undefined {
  const fileNames =
    process.platform === 'darwin' ? ['logo.png', 'app.ico'] : ['app.ico', 'logo.png']

  const bases = [
    join(process.resourcesPath, 'ximgs'),
    join(app.getAppPath(), 'resources', 'ximgs'),
    join(__dirname, '../../resources/ximgs'),
    join(__dirname, '../../../resources/ximgs')
  ]

  for (const base of bases) {
    for (const name of fileNames) {
      const candidate = join(base, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return undefined
}
