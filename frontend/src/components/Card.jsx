// Project summary cards for the list and dashboard screens. Presentational
// only: they render the adapted view model they are given, which lets the same
// card appear in scoped and unscoped lists without knowing the difference.

const progressBarColor = (pct) => pct > 0 ? '#5E6AD2' : 'transparent'
const ACCENT = '#5E6AD2'

const subLabelColor = {
  default: 'text-[#6B7280] dark:text-[#9CA3AF]',
  muted:   'text-[#9CA3AF] dark:text-[#6B7280]',
  success: 'text-[#6B7280] dark:text-[#9CA3AF]',
  danger:  'text-[#DC2626] dark:text-[#FCA5A5]',
  warning: 'text-[#6B7280] dark:text-[#9CA3AF]',
}

const paddingMap = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' }

export default function Card({ variant = 'default', children, className = '', onClick, hoverable = false, padding = 'md' }) {
  const clickable = Boolean(onClick) || hoverable
  const base = ['rounded-[8px] transition-all duration-150', paddingMap[padding]]

  if (variant === 'default') {
    base.push('bg-[#FFFFFF] dark:bg-[#1C1C1F]', 'border border-[#E2E8F0] dark:border-[#1E293B]')
    if (clickable) base.push('cursor-pointer hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#F8FAFC] dark:hover:bg-[#252529] active:scale-[0.995]')
  }
  if (variant === 'selected') base.push('bg-[#F8FAFC] dark:bg-[#1C1C1F]', 'border-[1.5px] border-[#5E6AD2]', clickable ? 'cursor-pointer active:scale-[0.995]' : '')
  if (variant === 'danger')   base.push('bg-[#FEF2F2] dark:bg-[#1A0707]', 'border border-[#FECACA] dark:border-[#7F1D1D]', clickable ? 'cursor-pointer active:scale-[0.995]' : '')
  if (variant === 'wrapper')  base.push('bg-[#FFFFFF] dark:bg-[#1C1C1F]', 'border border-[#E2E8F0] dark:border-[#1E293B]')

  return (
    <div className={[...base, className].filter(Boolean).join(' ')} onClick={onClick}>
      {children}
    </div>
  )
}

export function ProjectCard({ title, meta, projectType, progress = 0, status, typeBadge, extraBadges, date, onClick, selected = false, className = '' }) {
  const isDanger = projectType === 'clash'

  return (
    <div
      className={[
        'rounded-[8px] overflow-hidden transition-all duration-150',
        isDanger
          ? 'bg-[#FEF2F2] dark:bg-[#1A0707] border border-[#FECACA] dark:border-[#7F1D1D]'
          : selected
            ? 'bg-[#F8FAFC] dark:bg-[#1C1C1F] border-[1.5px] border-[#5E6AD2]'
            : 'bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E2E8F0] dark:border-[#1E293B]',
        onClick ? 'cursor-pointer hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:bg-[#F8FAFC] dark:hover:bg-[#252529] active:scale-[0.995]' : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">{title}</p>
          <div className="flex-shrink-0">{status}</div>
        </div>
        <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mb-4">{meta}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {typeBadge}
            {extraBadges}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {date && <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">{date}</span>}
            <span className="text-[12px] font-semibold" style={{ color: progress > 0 ? '#5E6AD2' : '#9CA3AF' }}>
              {progress}%
            </span>
          </div>
        </div>
      </div>
      <div className="h-[3px] bg-[#E2E8F0] dark:bg-[#1E293B]">
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: progressBarColor(progress) }} />
      </div>
    </div>
  )
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
