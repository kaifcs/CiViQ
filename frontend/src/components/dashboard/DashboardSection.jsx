// Titled panel used by every dashboard widget, so spacing, border and label
// treatment stay identical across the admin, officer, supervisor
// dashboards.
export default function DashboardSection({ title, action, children, className = '', bodyClassName = '' }) {
  return (
    <div
      className={[
        'bg-[#FFFFFF] dark:bg-[#1C1C1F]',
        'border border-[#E5E5E5] dark:border-[#27272A]',
        'rounded-[8px] p-5 flex flex-col min-w-0',
        className,
      ].join(' ')}
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
          {/* A real heading so screen readers can navigate between widgets. */}
          {title && (
            <h2 className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <div className={['min-w-0', bodyClassName].join(' ')}>{children}</div>
    </div>
  )
}
