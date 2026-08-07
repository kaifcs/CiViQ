// Supervised work, and the way into recording progress on it. GET /api/projects
// is already scoped to `supervisor = req.user._id` by the backend, so no
// client-side ownership filter is applied — none would be trustworthy anyway.

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import {
  DashboardSection, DashboardTable, StatGrid, Pill,
  formatDate, PROJECT_STATUS_LABELS, PROJECT_TERMINAL_STATUSES,
} from '../../components/dashboard'
import { PROJECT_STATUS_CONFIG } from '../../components/uiStyles'

const isOverdue = (p) =>
  !PROJECT_TERMINAL_STATUSES.includes(p.status) &&
  !!p.endDate &&
  new Date(p.endDate).getTime() < Date.now()

const FILTERS = [
  { id: 'live', label: 'Live' },
  { id: 'awaiting', label: 'Awaiting first update' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
]

function ProgressCell({ value }) {
  const pct = value ?? 0
  return (
    <div className="flex items-center gap-2 min-w-[92px]">
      <div className="flex-1 h-[4px] rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct > 0 ? '#5E6AD2' : 'transparent' }}
        />
      </div>
      <span className="text-[12px] font-semibold tabular-nums w-[34px] text-right"
        style={{ color: pct > 0 ? '#5E6AD2' : '#9CA3AF' }}>
        {pct}%
      </span>
    </div>
  )
}

export default function SupervisorTasks() {
  const navigate = useNavigate()
  const { data: projects, loading, error, reload } = useProjects()
  const [filter, setFilter] = useState('live')

  const all = useMemo(() => projects || [], [projects])

  const counts = useMemo(() => ({
    total: all.length,
    live: all.filter((p) => !PROJECT_TERMINAL_STATUSES.includes(p.status)).length,
    awaiting: all.filter((p) => !PROJECT_TERMINAL_STATUSES.includes(p.status) && (p.progress ?? 0) === 0).length,
    completed: all.filter((p) => p.status === 'completed').length,
    overdue: all.filter(isOverdue).length,
  }), [all])

  const rows = useMemo(() => {
    const live = (p) => !PROJECT_TERMINAL_STATUSES.includes(p.status)
    const byFilter = {
      live,
      awaiting: (p) => live(p) && (p.progress ?? 0) === 0,
      completed: (p) => p.status === 'completed',
      all: () => true,
    }
    return all.filter(byFilter[filter] || byFilter.all)
  }, [all, filter])

  const stats = useMemo(() => [
    { label: 'Assigned',   value: counts.total,     sub: 'Under my supervision' },
    { label: 'Live',       value: counts.live,      sub: 'Not yet completed' },
    { label: 'Awaiting',   value: counts.awaiting,  sub: 'No progress logged' },
    { label: 'Completed',  value: counts.completed, sub: 'Reached 100%' },
    { label: 'Overdue',    value: counts.overdue,   sub: 'Past end date', danger: true },
  ], [counts])

  const open = useCallback((row) => navigate(`/supervisor/tasks/${row.id}`), [navigate])

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading your tasks...">
      <div className="flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>

        <StatGrid stats={stats} columns={5} />

        <DashboardSection
          title="My tasks"
          action={
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`h-7 px-3 text-[12px] font-medium rounded-[6px] transition-colors ${
                    filter === f.id
                      ? 'bg-[#5E6AD2] text-white'
                      : 'text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <DashboardTable
            loading={loading}
            error={error}
            onRetry={reload}
            rows={rows}
            onRowClick={open}
            emptyTitle="Nothing here"
            emptyHint="Projects where you are named supervisor appear here. Select one to record progress."
            defaultSort={{ key: 'endDate', dir: 'asc' }}
            columns={[
              { key: 'title', header: 'Project', sortable: true, className: 'font-medium max-w-[220px] truncate',
                render: (r) => <span title={r.title}>{r.title}</span> },
              { key: 'officerName', header: 'Officer', sortable: true, className: 'max-w-[130px] truncate',
                render: (r) => r.officerName || '—' },
              { key: 'status', header: 'Status', sortable: true,
                render: (r) => (
                  <Pill color={PROJECT_STATUS_CONFIG[r.status]?.dot}>
                    {PROJECT_STATUS_LABELS[r.status] || r.status}
                  </Pill>
                ) },
              { key: 'progress', header: 'Progress', sortable: true,
                sortValue: (r) => r.progress ?? 0,
                render: (r) => <ProgressCell value={r.progress} /> },
              { key: 'endDate', header: 'Deadline', sortable: true,
                sortValue: (r) => new Date(r.endDate).getTime(),
                className: 'whitespace-nowrap',
                render: (r) => (
                  <span className={isOverdue(r)
                    ? 'text-[#DC2626] dark:text-[#FCA5A5] font-medium'
                    : 'text-[#6B7280] dark:text-[#9CA3AF]'}>
                    {formatDate(r.endDate)}
                  </span>
                ) },
            ]}
          />
        </DashboardSection>

      </div>
    </AsyncState>
  )
}
