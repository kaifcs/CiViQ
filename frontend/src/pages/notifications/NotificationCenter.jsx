// Full notification management: filtering, search, archive and bulk actions.
// Reads the same shared state as the navbar badge and dropdown, so the three
// can never disagree about what is unread.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotificationList } from '../../components/notifications'
import { useNotificationCenter } from '../../hooks/useNotificationCenter'
import { useArchivedNotifications } from '../../hooks/useResources'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
]

const CATEGORIES = [
  { id: 'project', label: 'Project' },
  { id: 'complaint', label: 'Complaint' },
  { id: 'conflict', label: 'Conflict' },
  { id: 'system', label: 'System' },
]

const PRIORITIES = [
  { id: 'high', label: 'High' },
  { id: 'normal', label: 'Normal' },
  { id: 'low', label: 'Low' },
]

// Account notices cannot be switched off, so their toggles render disabled.
const MANDATORY_CATEGORIES = ['system']

const chip = (active) => [
  'h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]',
  active
    ? 'bg-[#5E6AD2] text-white'
    : 'text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B]',
].join(' ')

const linkBtn =
  'text-[12px] font-medium text-[#5E6AD2] hover:text-[#4A56C1] transition-colors px-1 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]'

function PreferenceToggle({ checked, disabled, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-[#5E6AD2] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      />
      <span className="text-[12px] text-[#475569] dark:text-[#94A3B8]">{label}</span>
    </label>
  )
}

// Role-agnostic: renders inside whichever dashboard shell the route mounts it in.
export default function NotificationCenter() {
  const navigate = useNavigate()
  const {
    data, loading, error, reload, unreadCount, markRead, markAllRead,
    archive, unarchive, remove, preferences, savePreferences,
  } = useNotificationCenter()

  // Archived rows live outside the shared feed, so they are read separately and
  // only while the archive is on screen.
  const {
    data: archivedData, loading: archivedLoading,
    error: archivedError, reload: reloadArchived,
  } = useArchivedNotifications()

  const [showArchived, setShowArchived] = useState(false)
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [showPrefs, setShowPrefs] = useState(false)

  // Filtering runs against the list already in memory, so typing does not
  // issue a request per keystroke. The same fields are supported server-side
  // for callers that page through a longer history.
  const source = showArchived ? archivedData : data

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return source.filter((n) => {
      if (filter === 'unread' && n.read) return false
      if (filter === 'read' && !n.read) return false
      if (category && n.category !== category) return false
      if (priority && n.priority !== priority) return false
      if (term && !`${n.title} ${n.message}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [source, filter, category, priority, search])

  // Rows can leave the list at any time — archived from another tab, deleted,
  // or filtered out. Rather than pruning the stored set, selection is narrowed
  // to what is actually on screen, so a stale id can never be acted on.
  const activeSelection = useMemo(
    () => new Set(visible.filter((n) => selected.has(n.id)).map((n) => n.id)),
    [visible, selected]
  )

  const allVisibleSelected = visible.length > 0 && visible.every((n) => activeSelection.has(n.id))

  function toggleSelect(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((n) => n.id)))
  }

  function handleActivate(notification) {
    markRead(notification.id)
    if (notification.link) navigate(notification.link)
  }

  const selectedIds = [...activeSelection]
  const hasFilters = Boolean(category || priority || search.trim() || filter !== 'all')

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">Notifications</h2>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
            {showArchived
              ? 'Archived notifications. Restoring one returns it to your inbox.'
              : unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowPrefs((v) => !v)}
            aria-expanded={showPrefs} className={linkBtn}>
            {showPrefs ? 'Hide preferences' : 'Preferences'}
          </button>
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => { setShowArchived((v) => !v); setSelected(new Set()) }}
            className={linkBtn}
          >
            {showArchived ? 'Back to inbox' : 'Archived'}
          </button>
          {!showArchived && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="h-9 px-4 text-[13px] font-medium text-[#5E6AD2] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {showPrefs && (
        <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] p-5">
          <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-1">
            Delivery preferences
          </p>
          <p className="text-[12px] text-[#9CA3AF] mb-4">
            Muted categories stay in your history but stop appearing in the feed and the badge.
            Account notices cannot be switched off.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {['inApp', 'email'].map((channel) => (
              <div key={channel}>
                <p className="text-[12px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-2">
                  {channel === 'inApp' ? 'In-app' : 'Email'}
                </p>
                <div className="flex flex-col gap-2">
                  {CATEGORIES.map((c) => (
                    <PreferenceToggle
                      key={c.id}
                      label={c.label}
                      disabled={MANDATORY_CATEGORIES.includes(c.id)}
                      checked={preferences?.[channel]?.[c.id] !== false}
                      onChange={(value) => savePreferences({ [channel]: { [c.id]: value } })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notifications..."
          aria-label="Search notifications"
          className="w-full h-10 px-3 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
        />

        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filter notifications">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)} className={chip(filter === f.id)}>
              {f.label}
            </button>
          ))}
          <span className="w-px h-5 bg-[#E5E5E5] dark:bg-[#27272A]" aria-hidden="true" />
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" aria-pressed={category === c.id}
              onClick={() => setCategory(category === c.id ? '' : c.id)}
              className={chip(category === c.id)}>
              {c.label}
            </button>
          ))}
          <span className="w-px h-5 bg-[#E5E5E5] dark:bg-[#27272A]" aria-hidden="true" />
          {PRIORITIES.map((p) => (
            <button key={p.id} type="button" aria-pressed={priority === p.id}
              onClick={() => setPriority(priority === p.id ? '' : p.id)}
              className={chip(priority === p.id)}>
              {p.label}
            </button>
          ))}
          {hasFilters && (
            <button type="button" className={linkBtn}
              onClick={() => { setFilter('all'); setCategory(''); setPriority(''); setSearch('') }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              aria-label="Select all shown notifications"
              className="w-3.5 h-3.5 accent-[#5E6AD2] cursor-pointer"
            />
            <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
              {activeSelection.size > 0 ? `${activeSelection.size} selected` : 'Select all'}
            </span>
          </label>
          {activeSelection.size > 0 && (
            <>
              <button type="button" className={linkBtn}
                onClick={() => {
                  if (showArchived) unarchive(selectedIds)
                  else archive(selectedIds)
                  setSelected(new Set())
                }}>
                {showArchived ? 'Restore selected' : 'Archive selected'}
              </button>
              <button type="button"
                className="text-[12px] font-medium text-[#DC2626] hover:text-[#B91C1C] transition-colors px-1 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                onClick={() => { remove(selectedIds); setSelected(new Set()) }}>
                Delete selected
              </button>
            </>
          )}
        </div>
      )}

      <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] overflow-hidden">
        <NotificationList
          notifications={visible}
          loading={showArchived ? archivedLoading : loading}
          error={showArchived ? archivedError : error}
          onRetry={showArchived ? reloadArchived : reload}
          onActivate={handleActivate}
          selectable
          selectedIds={activeSelection}
          onSelectChange={toggleSelect}
          renderActions={(n) => (
            <>
              <button type="button" onClick={() => (showArchived ? unarchive(n.id) : archive(n.id))}
                aria-label={`${showArchived ? 'Restore' : 'Archive'} notification: ${n.title}`}
                className="text-[11px] font-medium text-[#6B7280] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] px-1.5 py-1 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]">
                {showArchived ? 'Restore' : 'Archive'}
              </button>
              <button type="button" onClick={() => remove(n.id)}
                aria-label={`Delete notification: ${n.title}`}
                className="text-[11px] font-medium text-[#9CA3AF] hover:text-[#DC2626] px-1.5 py-1 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]">
                Delete
              </button>
            </>
          )}
          emptyTitle={
            hasFilters ? 'No matching notifications'
              : showArchived ? 'Nothing archived'
              : 'No notifications yet'
          }
          emptyHint={
            hasFilters ? 'Try clearing the filters or search term.'
              : showArchived
                ? 'Notifications you archive are kept here and can be restored.'
                : 'Updates about your projects, complaints and conflicts will appear here.'
          }
        />
      </div>
    </div>
  )
}
