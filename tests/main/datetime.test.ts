import { describe, expect, it } from 'vitest'
import { parseAppDate } from '../../src/shared/datetime'

describe('parseAppDate', () => {
  it('treats SQLite datetime(now) as UTC', () => {
    const d = parseAppDate('2026-10-29 03:02:30')
    expect(d.toISOString()).toBe('2026-10-29T03:02:30.000Z')
  })

  it('keeps explicit Z / offset', () => {
    expect(parseAppDate('2026-10-29T11:02:30.000Z').toISOString()).toBe(
      '2026-10-29T11:02:30.000Z'
    )
    expect(parseAppDate('2026-10-29T11:02:30+08:00').toISOString()).toBe(
      '2026-10-29T03:02:30.000Z'
    )
  })
})
