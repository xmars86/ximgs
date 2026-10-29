import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'

function resourceBases(): string[] {
  return [
    join(process.resourcesPath, 'ximgs'),
    join(app.getAppPath(), 'resources', 'ximgs'),
    join(__dirname, '../../resources/ximgs'),
    join(__dirname, '../../../resources/ximgs')
  ]
}

function firstExisting(names: string[]): string | undefined {
  for (const base of resourceBases()) {
    for (const name of names) {
      const candidate = join(base, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

/** Resolve window / installer icon from resources/ximgs (dev + packaged). */
export function getAppIconPath(): string | undefined {
  const fileNames =
    process.platform === 'darwin' ? ['logo.png', 'app.ico'] : ['app.ico', 'logo.png']
  return firstExisting(fileNames)
}

/** Dedicated tray asset path when present (`tray.png` / sized variants). */
export function getTrayIconPath(): string | undefined {
  const preferSmall = process.platform === 'win32'
  const names = preferSmall
    ? ['tray-16.png', 'tray.png', 'tray-32.png', 'logo.png', 'app.ico']
    : ['tray.png', 'tray-32.png', 'tray-16.png', 'logo.png', 'app.ico']
  return firstExisting(names)
}

/**
 * Native tray image: prefer dedicated tray PNG, else resize logo/app icon to 16/32.
 * Avoids blurry full-size .ico in the Windows notification area.
 */
export function getTrayNativeImage(): NativeImage | undefined {
  const path = getTrayIconPath() ?? getAppIconPath()
  if (!path) return undefined

  let image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return undefined

  const size = process.platform === 'darwin' ? 22 : 16
  const { width, height } = image.getSize()
  if (width > size || height > size) {
    image = image.resize({ width: size, height: size, quality: 'best' })
  }
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }
  return image
}
