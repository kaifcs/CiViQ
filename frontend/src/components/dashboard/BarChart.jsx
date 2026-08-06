import { useMemo } from 'react'
import { EmptyState } from '../AsyncState'

const ACCENT = '#5E6AD2'

/**
 * Horizontal bar chart — the charting approach already used by this codebase
 * (CSS widths, no charting library). Extracted so every dashboard renders
 * comparisons identically.
 *
 * `data` is [{ label, value, color? }]. Bars are scaled to the largest value,
 * which is computed once per data change rather than per bar.
 */
export default function BarChart({ data = [], suffix = '', labelWidth = 72, emptyHint }) {
  const max = useMemo(
    () => data.reduce((m, d) => (Number.isFinite(d.value) && d.value > m ? d.value : m), 0),
    [data]
  )

  if (data.length === 0) {
    return <EmptyState title="No data yet" hint={emptyHint} />
  }

  const summary = data.map((d) => `${d.label}: ${d.value}${suffix}`).join(', ')

  return (
    <div className="flex flex-col gap-3" role="img" aria-label={summary}>
      {data.map((d) => {
        // A zero maximum would make every bar NaN wide.
        const pct = max > 0 ? Math.round((d.value / max) * 100) : 0
        return (
          <div key={d.label} className="flex items-center gap-3">
            <span
              className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] flex-shrink-0 truncate"
              style={{ width: labelWidth }}
              title={d.label}
            >
              {d.label}
            </span>
            <div className="flex-1 h-[6px] bg-[#F3F4F6] dark:bg-[#27272A] rounded-full overflow-hidden min-w-0">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: d.color || ACCENT, transition: 'width 0.4s ease' }}
                title={`${d.label}: ${d.value}${suffix}`}
              />
            </div>
            <span className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] w-9 text-right flex-shrink-0 tabular-nums">
              {d.value}{suffix}
            </span>
          </div>
        )
      })}
    </div>
  )
}
