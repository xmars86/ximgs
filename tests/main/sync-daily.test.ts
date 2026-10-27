import { describe, expect, it } from 'vitest'
import { fillDailyUploadSeries, localDayKey, summarizeDailyUploadStats } from '../../src/shared/syncDaily'

describe('sync daily upload series', () => {
  it('fills seven local days ending today', () => {
    const now = new Date(2026, 9, 27, 15, 0, 0) // Oct 27 local
    const series = fillDailyUploadSeries(
      {
        '2026-10-21': 7,
        '2026-10-22': 41,
        '2026-10-25': 62,
        '2026-10-27': 24
      },
      7,
      now
    )

    expect(series).toHaveLength(7)
    expect(series[0]).toEqual({ day: '2026-10-21', count: 7 })
    expect(series[1]).toEqual({ day: '2026-10-22', count: 41 })
    expect(series[2]).toEqual({ day: '2026-10-23', count: 0 })
    expect(series[3]).toEqual({ day: '2026-10-24', count: 0 })
    expect(series[4]).toEqual({ day: '2026-10-25', count: 62 })
    expect(series[5]).toEqual({ day: '2026-10-26', count: 0 })
    expect(series[6]).toEqual({ day: '2026-10-27', count: 24 })
    expect(summarizeDailyUploadStats(series).total).toBe(134)
  })

  it('localDayKey uses local calendar components', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
