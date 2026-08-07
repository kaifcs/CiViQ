// Shared filter bar for dashboards reading the analytics endpoints. Presentation
// only: the owning page holds the filter state, so every widget on it moves
// together. `fields` is [{ key, label, type: 'select' | 'date', options? }].
export default function DashboardFilters({ fields = [], values = {}, onChange, onReset }) {
  const active = fields.some((f) => values[f.key])

  return (
    <div className="flex items-end gap-3 flex-wrap">
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em]">
            {f.label}
          </span>
          {f.type === 'date' ? (
            <input
              type="date"
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="h-9 px-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] transition-all"
            />
          ) : (
            <select
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              style={{ minWidth: '150px', paddingRight: '32px' }}
              className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] transition-all cursor-pointer"
            >
              <option value="">All</option>
              {(f.options || []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </label>
      ))}

      {active && onReset && (
        <button
          onClick={onReset}
          className="h-9 text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
