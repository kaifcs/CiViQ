import { useMemo } from 'react'
import { EmptyState } from '../AsyncState'

const ACCENT = '#5E6AD2'

// The analytics endpoints return months as "YYYY-MM", oldest first.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (key) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''))
  return m ? MONTHS[Number(m[2]) - 1] : String(key || '')
}

// Monthly trend as vertical columns, drawn with CSS rather than a charting
// library so it matches BarChart. `data` is the analytics endpoints' `monthly`
// series: [{ month: "2026-08", count: 12 }].
export default function TrendChart({ data = [], color = ACCENT, height = 120, emptyHint }) {
  const { series, max } = useMemo(() => {
    const s = data.map((d) => ({
      key: d.month ?? d._id ?? '',
      label: monthLabel(d.month ?? d._id),
      value: Number(d.count ?? d.total ?? 0) || 0,
    }))
    return { series: s, max: s.reduce((m, d) => (d.value > m ? d.value : m), 0) }
  }, [data])

  if (series.length === 0) {
    return <EmptyState title="No trend data yet" hint={emptyHint} />
  }

  const summary = series.map((d) => `${d.label}: ${d.value}`).join(', ')

  return (
    <div className="flex flex-col gap-2 min-w-0" role="img" aria-label={summary}>
      <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height }}>
        {series.map((d) => {
          // Keep a visible stub for real zero months so gaps read as data.
          const pct = max > 0 ? Math.max(Math.round((d.value / max) * 100), d.value > 0 ? 4 : 2) : 2
          return (
            <div key={d.key} className="flex-1 min-w-[18px] flex flex-col justify-end h-full">
              <div
                className="w-full rounded-t-[3px]"
                style={{
                  height: `${pct}%`,
                  backgroundColor: d.value > 0 ? color : '#E5E7EB',
                  transition: 'height 0.4s ease',
                }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {series.map((d) => (
          <span
            key={d.key}
            className="flex-1 min-w-[18px] text-[10px] text-[#9CA3AF] dark:text-[#6B7280] text-center truncate"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
