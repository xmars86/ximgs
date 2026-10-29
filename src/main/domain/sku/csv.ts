import { AppError } from '@shared/errors'
import {
  SKU_IMPORT_HEADERS,
  SKU_IMPORT_MAX_ROWS,
  type SkuImportHeader
} from '@shared/sku'

/** Escape a CSV cell (RFC-style quotes). */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Parse one CSV line into cells (supports quoted fields with commas / escaped quotes). */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur)
  return cells
}

/** Split file text into logical CSV records (handles quoted newlines). */
export function splitCsvRecords(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const records: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!
    if (ch === '"') {
      cur += ch
      if (inQuotes && normalized[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === '\n' && !inQuotes) {
      records.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.length > 0 || normalized.endsWith('\n')) {
    records.push(cur)
  }
  return records
}

export type SkuImportRow = Record<SkuImportHeader, string>

export interface ParsedSkuCsv {
  rows: { rowNumber: number; cells: SkuImportRow }[]
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_')
}

/**
 * Parse CSV text into typed import rows.
 * Requires a header row containing at least `sku` (and preferably all template columns).
 */
export function parseSkuImportCsv(text: string): ParsedSkuCsv {
  const records = splitCsvRecords(text)
  if (!records.length || records.every((r) => !r.trim())) {
    throw new AppError('SKU_IMPORT_EMPTY', 'CSV 文件为空')
  }

  let headerIndex = -1
  let headerCells: string[] = []
  for (let i = 0; i < records.length; i++) {
    const cells = parseCsvLine(records[i]!).map(normalizeHeader)
    if (cells.includes('sku')) {
      headerIndex = i
      headerCells = cells
      break
    }
  }
  if (headerIndex < 0) {
    throw new AppError('SKU_IMPORT_HEADER', '缺少表头列 sku')
  }

  const indexOf: Partial<Record<SkuImportHeader, number>> = {}
  for (const key of SKU_IMPORT_HEADERS) {
    const idx = headerCells.indexOf(key)
    if (idx >= 0) indexOf[key] = idx
  }
  if (indexOf.sku == null) {
    throw new AppError('SKU_IMPORT_HEADER', '缺少表头列 sku')
  }

  const rows: ParsedSkuCsv['rows'] = []
  for (let i = headerIndex + 1; i < records.length; i++) {
    const rawLine = records[i]!
    if (!rawLine.trim()) continue
    const cells = parseCsvLine(rawLine)
    const skuRaw = (cells[indexOf.sku!] ?? '').trim()
    if (!skuRaw) continue

    const mapped = {} as SkuImportRow
    for (const key of SKU_IMPORT_HEADERS) {
      const idx = indexOf[key]
      mapped[key] = idx == null ? '' : String(cells[idx] ?? '').trim()
    }
    // 1-based spreadsheet row (header is row headerIndex+1).
    rows.push({ rowNumber: i + 1, cells: mapped })
  }

  if (rows.length > SKU_IMPORT_MAX_ROWS) {
    throw new AppError(
      'SKU_IMPORT_TOO_MANY',
      `单次最多导入 ${SKU_IMPORT_MAX_ROWS} 行，当前 ${rows.length} 行`
    )
  }

  return { rows }
}

/** Build UTF-8 BOM CSV template with header + one sample data row. */
export function buildSkuImportTemplate(): string {
  const header = SKU_IMPORT_HEADERS.join(',')
  const sample = [
    'AMZ-SAMPLE-001',
    '示例产品',
    '家居',
    'Acme',
    '012345678905',
    '10',
    '8',
    '5',
    '0.5',
    '0.4',
    '导入时请删除本行示例'
  ]
    .map(csvEscape)
    .join(',')
  return `\uFEFF${header}\r\n${sample}\r\n`
}
