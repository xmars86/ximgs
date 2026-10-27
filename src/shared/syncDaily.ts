import type { SyncDailyUploadPoint, SyncDailyUploadStats } from './sync'

/** Local calendar day key YYYY-MM-DD. */
export function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Build a fixed-length daily series (oldest → today), filling missing days with 0.
 */
export function fillDailyUploadSeries(
  countsByDay: Record<string, number>,
  dayCount = 7,
  now: Date = new Date()
): SyncDailyUploadPoint[] {
  const n = Math.max(1, Math.min(dayCount, 31))
  const days: SyncDailyUploadPoint[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = localDayKey(d)
    days.push({ day: key, count: Math.max(0, Number(countsByDay[key] ?? 0) || 0) })
  }
  return days
}

export function summarizeDailyUploadStats(days: SyncDailyUploadPoint[]): SyncDailyUploadStats {
  const total = days.reduce((sum, d) => sum + d.count, 0)
  return { days, total }
}
