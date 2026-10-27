import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export async function md5File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function md5Buffer(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex')
}
