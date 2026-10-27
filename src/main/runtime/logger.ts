import log from 'electron-log/main'
import { join } from 'node:path'
import { getLogsDir } from './paths'

export function setupLogger(): typeof log {
  log.initialize()
  log.transports.file.resolvePathFn = (): string => join(getLogsDir(), 'main.log')
  log.transports.file.level = 'info'
  log.transports.console.level = 'debug'
  return log
}

export { log }
