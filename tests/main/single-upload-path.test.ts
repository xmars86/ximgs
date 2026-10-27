import { describe, expect, it } from 'vitest'
import {
  buildUploadRelativePath,
  sanitizeUploadFolder
} from '../../src/main/domain/sync/singleUpload'

describe('single upload object path', () => {
  it('sanitizes custom folder and keeps clean file name', () => {
    expect(sanitizeUploadFolder('../products\\ASIN 01/..\\x')).toBe('products/ASIN_01/x')
    expect(buildUploadRelativePath('封面 (1).PNG', 'products/ASIN01')).toBe(
      'products/ASIN01/封面_1.png'
    )
  })

  it('falls back to images/yyyy/mm with stamp when folder empty', () => {
    const path = buildUploadRelativePath('a.jpg', '')
    expect(path).toMatch(/^images\/\d{4}\/\d{2}\/[a-z0-9]+_a\.jpg$/)
  })

  it('rejects empty / traversal-only folders', () => {
    expect(sanitizeUploadFolder('..')).toBe('')
    expect(sanitizeUploadFolder('///')).toBe('')
  })
})
