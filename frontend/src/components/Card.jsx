// The dashboard stat tile: a label, a large figure and an optional sub-label.
// Reached through components/dashboard/StatGrid rather than directly, so the five
// dashboards cannot lay tiles out differently from one another. `valueColor` only
// distinguishes bad news from everything else, keeping the palette a fixed token
// set instead of a free-form colour prop.

const ACCENT = '#5E6AD2'

const subLabelColor = {
  default: 'text-[#6B7280] dark:text-[#9CA3AF]',
  muted:   'text-[#9CA3AF] dark:text-[#6B7280]',
  success: 'text-[#6B7280] dark:text-[#9CA3AF]',
  danger:  'text-[#DC2626] dark:text-[#FCA5A5]',
  warning: 'text-[#6B7280] dark:text-[#9CA3AF]',
}

export function StatCard({ label, value, valueColor = 'default', subLabel, subLabelColor: subColor = 'muted', className = '' }) {
  return (
    <div
      className={['bg-[#F8FAFC] dark:bg-[#18181B] rounded-[8px] px-5 pt-4 pb-5 border border-[#E2E8F0] dark:border-[#1E293B]', className].join(' ')}
      style={{ borderTop: `2px solid ${ACCENT}` }}
    >
      <p className="text-[12px] font-medium text-[#6B7280] dark:text-[#9CA3AF] mb-3 leading-none uppercase tracking-wide">{label}</p>
      <p className={['text-[32px] font-bold leading-none mb-2', valueColor === 'danger' ? 'text-[#DC2626] dark:text-[#FCA5A5]' : 'text-[#0F172A] dark:text-[#F8FAFC]'].join(' ')}>
        {value}
      </p>
      {subLabel && <p className={['text-[13px] leading-none', subLabelColor[subColor]].join(' ')}>{subLabel}</p>}
    </div>
  )
}
