// Fallback screen for routes that are registered but not yet implemented.

export default function PlaceholderPage({ title = 'Coming Soon', phase = 2 }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
      <div className="w-12 h-12 rounded-[12px] bg-[#EEF2FF] dark:bg-[#131629] flex items-center justify-center">
        <svg width="22" height="22" fill="none" stroke="#5E6AD2" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-[16px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{title}</h2>
        <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
          Building in Phase {phase}
        </p>
      </div>
    </div>
  )
}
