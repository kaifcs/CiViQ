import AsyncState, { EmptyState } from '../AsyncState'
import NotificationItem from './NotificationItem'

// Loading / error / empty / list rendering for a set of notifications. Both the
// dropdown and the Notification Center render through this, so their async
// states stay identical.
export default function NotificationList({
  notifications = [],
  loading,
  error,
  onRetry,
  onActivate,
  compact = false,
  emptyTitle = 'No notifications yet',
  emptyHint,
  label = 'Loading notifications...',
  selectable = false,
  selectedIds,
  onSelectChange,
  renderActions,
}) {
  return (
    <AsyncState loading={loading} error={error} onRetry={onRetry} label={label}>
      {notifications.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <ul className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
          {notifications.map((n) => (
            <li key={n.id}>
              <NotificationItem
                notification={n}
                onActivate={onActivate}
                compact={compact}
                selectable={selectable}
                selected={Boolean(selectedIds?.has(n.id))}
                onSelectChange={onSelectChange}
                actions={renderActions?.(n)}
              />
            </li>
          ))}
        </ul>
      )}
    </AsyncState>
  )
}
