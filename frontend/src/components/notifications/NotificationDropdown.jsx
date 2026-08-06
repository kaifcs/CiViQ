import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import NotificationList from "./NotificationList"
import { useNotificationCenter } from "../../hooks/useNotificationCenter"

const RECENT_LIMIT = 5

/**
 * The panel behind the navbar bell. Open/close stays with the Navbar so its
 * icon row and outside-click handling are untouched; this owns only the
 * contents, which come from the shared notification state.
 */
export default function NotificationDropdown({ onClose, centerPath }) {
  const navigate = useNavigate()
  const { data, loading, error, reload, unreadCount, markRead, markAllRead } = useNotificationCenter()

  const recent = useMemo(() => data.slice(0, RECENT_LIMIT), [data])

  function handleActivate(notification) {
    markRead(notification.id)
    onClose()
    if (notification.link) navigate(notification.link)
  }

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-11 w-80 rounded-[8px] py-1 z-50 bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E2E8F0] dark:border-[#1E293B] shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.40)]"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#E2E8F0] dark:border-[#1E293B]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          Notifications
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-[11px] font-medium text-[#5E6AD2] hover:text-[#4A56C1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2] rounded-[4px] px-1"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        <NotificationList
          notifications={recent}
          loading={loading}
          error={error}
          onRetry={reload}
          onActivate={handleActivate}
          compact
          emptyTitle="No new notifications"
          label="Loading..."
        />
      </div>

      {centerPath && (
        <div className="border-t border-[#E2E8F0] dark:border-[#1E293B]">
          <button
            type="button"
            onClick={() => { onClose(); navigate(centerPath) }}
            className="w-full text-[12px] font-medium text-[#5E6AD2] hover:text-[#4A56C1] hover:bg-[#F8FAFC] dark:hover:bg-[#252529] transition-colors py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2] focus-visible:ring-inset"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
