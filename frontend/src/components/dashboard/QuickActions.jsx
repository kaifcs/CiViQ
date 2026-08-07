// Row of navigation shortcuts. Each action is a plain route jump — no business
// logic, no requests — so any dashboard can reuse it by passing its own list.
// `actions` is [{ id, label, hint, icon, to }].
export default function QuickActions({ actions = [], onNavigate }) {
  if (actions.length === 0) return null

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => onNavigate(a.to)}
          className="flex items-center gap-3 text-left px-4 py-3 rounded-[8px] bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] hover:border-[#5E6AD2] dark:hover:border-[#5E6AD2] transition-colors"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <span className="w-8 h-8 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] flex items-center justify-center flex-shrink-0 text-[#5E6AD2]">
            {a.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
              {a.label}
            </span>
            {a.hint && (
              <span className="block text-[11px] text-[#9CA3AF] dark:text-[#6B7280] truncate">{a.hint}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
