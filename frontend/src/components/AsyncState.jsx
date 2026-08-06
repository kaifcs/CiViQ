// Shared loading / error / empty states for data-driven screens.

const ACCENT = "#5E6AD2"

export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke={ACCENT} strokeOpacity="0.25" strokeWidth="1.5" />
        <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">{label}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const message = error?.message || "Something went wrong"
  const status = error?.status
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-12 h-12 rounded-[12px] bg-[#FEF2F2] dark:bg-[#1F0A0A] flex items-center justify-center">
        <svg width="22" height="22" fill="none" stroke="#DC2626" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
          {status === 403 ? "You do not have access to this" : status === 401 ? "Your session has expired" : "Could not load data"}
        </p>
        <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title = "Nothing here yet", hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
      <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">{title}</p>
      {hint && <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280]">{hint}</p>}
      {action}
    </div>
  )
}

/** Renders loading/error first, then children. Keeps screens uncluttered. */
export default function AsyncState({ loading, error, onRetry, children, label }) {
  if (loading) return <LoadingState label={label} />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  return children
}
