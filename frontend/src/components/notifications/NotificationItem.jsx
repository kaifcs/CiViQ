import { timeAgo } from '../dashboard'

const PRIORITY_DOT = {
  high: 'bg-[#DC2626]',
  normal: 'bg-[#5E6AD2]',
  low: 'bg-[#94A3B8]',
}

/**
 * One notification row, shared by the dropdown and the Notification Center.
 *
 * Activating a row marks it read and, when the notification carries a deep
 * link, navigates to it. Rendered as a button so it is reachable by keyboard
 * and announced correctly.
 */
export default function NotificationItem({
  notification, onActivate, compact = false,
  selectable = false, selected = false, onSelectChange, actions,
}) {
  const { title, message, read, priority, createdAt } = notification
  const when = timeAgo(createdAt)

  // Selection and row actions sit beside the activator rather than inside it,
  // so no interactive control is ever nested in a button.
  const row = (
    <button
      type="button"
      onClick={() => onActivate(notification)}
      aria-label={`${read ? 'Read' : 'Unread'} notification: ${title}. ${message}`}
      className={[
        'flex-1 min-w-0 text-left flex items-start gap-2.5 transition-colors',
        compact ? 'px-4 py-3' : 'px-4 py-3.5',
        'hover:bg-[#F8FAFC] dark:hover:bg-[#252529]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2] focus-visible:ring-inset',
        read ? '' : 'bg-[#FAFBFF] dark:bg-[#16161A]',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
          read ? 'bg-transparent' : PRIORITY_DOT[priority] || PRIORITY_DOT.normal,
        ].join(' ')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={[
            'text-[13px] truncate',
            read
              ? 'font-normal text-[#475569] dark:text-[#94A3B8]'
              : 'font-medium text-[#0F172A] dark:text-[#F8FAFC]',
          ].join(' ')}>
            {title}
          </span>
          {when && (
            <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] flex-shrink-0 whitespace-nowrap">
              {when}
            </span>
          )}
        </span>
        <span className={[
          'block text-[12px] text-[#64748B] dark:text-[#94A3B8] mt-0.5',
          compact ? 'truncate' : '',
        ].join(' ')}>
          {message}
        </span>
      </span>
    </button>
  )

  if (!selectable && !actions) return row

  return (
    <div className={[
      'flex items-stretch',
      read ? '' : 'bg-[#FAFBFF] dark:bg-[#16161A]',
    ].join(' ')}>
      {selectable && (
        <label className="flex items-center pl-4 cursor-pointer">
          <span className="sr-only">{`Select notification: ${title}`}</span>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectChange?.(notification.id, e.target.checked)}
            className="w-3.5 h-3.5 accent-[#5E6AD2] cursor-pointer"
          />
        </label>
      )}
      {row}
      {actions && (
        <div className="flex items-center gap-1 pr-3 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}
