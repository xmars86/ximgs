import { describe, expect, it } from 'vitest'
import { AppError } from '@shared/errors'
import {
  buildSkuImportTemplate,
  parseCsvLine,
  parseSkuImportCsv
} from '../../src/main/domain/sku/csv'

describe('sku csv import', () => {
  it('parses quoted commas and escapes', () => {
    expect(parseCsvLine('a,"b,c","d""e"')).toEqual(['a', 'b,c', 'd"e'])
  })

  it('parses template and skips empty sku rows', () => {
    const text = buildSkuImportTemplate()
    const { rows } = parseSkuImportCsv(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.cells.sku).toBe('AMZ-SAMPLE-001')
    expect(rows[0]!.cells.name).toBe('示例产品')
    expect(rows[0]!.cells.length_cm).toBe('10')
  })

  it('maps custom column order and skips empty sku', () => {
    const csv = [
      'name,sku,note',
      'Widget,SKU-1,hello',
      'NoSku,,ignored',
      '"Wide, Name",SKU-2,'
    ].join('\n')
    const { rows } = parseSkuImportCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.cells.sku).toBe('SKU-1')
    expect(rows[0]!.cells.name).toBe('Widget')
    expect(rows[0]!.cells.note).toBe('hello')
    expect(rows[1]!.cells.sku).toBe('SKU-2')
    expect(rows[1]!.cells.name).toBe('Wide, Name')
  })

  it('rejects missing sku header', () => {
    expect(() => parseSkuImportCsv('name,brand\nA,B\n')).toThrow(AppError)
  })
})
