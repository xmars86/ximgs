/**
 * Parse timestamps coming from main / SQLite for UI display.
 *
 * SQLite `datetime('now')` stores UTC as `YYYY-MM-DD HH:MM:SS` with no zone.
 * Chromium often treats that form as *local* time, which shifts display by the
 * machine offset (e.g. −8h in China). ISO strings with `Z` / offset are left as-is.
 */
export function parseAppDate(value: string): Date {
  const s = value.trim()
  if (!s) return new Date(NaN)
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s)
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/)
  if (m) {
    return new Date(`${m[1]}T${m[2]}${m[3] ?? ''}Z`)
  }
  return new Date(s)
}
