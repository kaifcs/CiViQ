// Formatting shared by every dashboard.
//
// These were previously redefined in each dashboard page. The copies were
// logically identical apart from the date format, where the citizen dashboard
// included the year and the others did not — hence two explicit functions
// rather than one with a flag.

const DAY = 86400000

const parse = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "12 Mar" — the default across dashboard tables. */
export const formatDate = (value) => {
  const d = parse(value)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'
}

/** "12 Mar 2026" — used where the year matters (popups, citizen-facing views). */
export const formatDateLong = (value) => {
  const d = parse(value)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

/** Relative time against the current clock, floored at zero for future dates. */
export function timeAgo(value) {
  const then = parse(value)
  if (!then) return ''
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000))
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

/** Day-granularity relative time: "Today", "Yesterday", or "N days ago". */
export function relativeDay(value) {
  const d = parse(value)
  if (!d) return '—'
  const days = Math.floor((Date.now() - d) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/** Whole days elapsed since `value`; 0 for future or unparseable dates. */
export const daysSince = (value) => {
  const d = parse(value)
  return d ? Math.max(0, Math.floor((Date.now() - d) / DAY)) : 0
}

/** Whole days until `value`; negative when overdue, null when unparseable. */
export const daysUntil = (value) => {
  const d = parse(value)
  return d ? Math.ceil((d - Date.now()) / DAY) : null
}

export const percent = (n) => (Number.isFinite(n) ? `${Math.round(n)}%` : '—')

export const formatDays = (n) =>
  Number.isFinite(n) ? `${Math.round(n * 10) / 10}d` : '—'

/** "YYYY-MM" bucket key, or null when the date cannot be parsed. */
export const monthKey = (value) => {
  const d = parse(value)
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null
}

/**
 * Groups records into the { month, count } shape TrendChart consumes, oldest
 * first. `dateOf` selects the date field to bucket on.
 */
export function monthlySeries(records = [], dateOf) {
  const counts = new Map()
  for (const r of records) {
    const key = monthKey(dateOf(r))
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }))
}

/** Maps the analytics endpoints' `period` series onto TrendChart's `month`. */
export const toTrendSeries = (series = []) =>
  series.map((m) => ({ month: m.period, count: m.count }))
