// Officer landing screen. Every list is already scoped by the backend to this
// officer's own projects, so nothing here filters by ownership.

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProjects, useConflicts, useComplaints, useNotifications } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import {
  DashboardSection, BarChart, TrendChart, DashboardTable, QuickActions, StatGrid,
  Pill, ActionIcon,
  formatDate, timeAgo, daysUntil, monthlySeries,
  PROJECT_STATUS_LABELS, PROJECT_TERMINAL_STATUSES, COMPLAINT_STATUS_LABELS,
} from '../../components/dashboard'

const DEADLINE_WINDOW_DAYS = 30


// Share of a project's scheduled window that has elapsed, clamped to 0–100.
function scheduleElapsed(project) {
  const start = new Date(project.startDate).getTime()
  const end = new Date(project.endDate).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)))
}


export default function OfficerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // GET /api/projects is filtered to `officer = req.user._id` by the backend,
  // so this list IS "my projects" — no client-side ownership filtering needed.
  const { data: projects, loading, error, reload } = useProjects()
  const { data: conflicts, loading: loadingConflicts, error: conflictsError } = useConflicts()
  // Dashboard and list use the same assigned-officer scope.
  const myComplaintParams = useMemo(() => ({ assignedOfficer: user.id }), [user.id])
  const { data: complaints, loading: loadingComplaints, error: complaintsError } = useComplaints(myComplaintParams)
  // Audit is admin-only, so notifications are the officer's authorised feed.
  const { data: notifications, loading: loadingNotifications, error: notificationsError } = useNotifications()

  const myProjects = useMemo(() => projects || [], [projects])
  const myProjectIds = useMemo(() => new Set(myProjects.map((p) => p.id)), [myProjects])

  // Conflicts are not role-scoped by the backend, so narrow them to the ones
  // touching a project this officer actually owns.
  const myConflicts = useMemo(
    () => (conflicts || []).filter((c) => myProjectIds.has(c.projectAId) || myProjectIds.has(c.projectBId)),
    [conflicts, myProjectIds]
  )
  const openConflicts = useMemo(() => myConflicts.filter((c) => c.status === 'unresolved'), [myConflicts])

  // Already scoped by the request above; no client-side narrowing to drift.
  const myComplaints = useMemo(() => complaints || [], [complaints])

  const upcomingDeadlines = useMemo(
    () => myProjects
      .filter((p) => {
        if (PROJECT_TERMINAL_STATUSES.includes(p.status)) return false
        const d = daysUntil(p.endDate)
        return d !== null && d >= 0 && d <= DEADLINE_WINDOW_DAYS
      })
      .sort((a, b) => new Date(a.endDate) - new Date(b.endDate)),
    [myProjects]
  )

  const stats = useMemo(() => {
    const byStatus = myProjects.reduce((m, p) => (m[p.status] = (m[p.status] || 0) + 1, m), {})
    const inProgress = myProjects.filter((p) => p.progress > 0 && p.progress < 100).length
    return [
      { label: 'My Projects',       value: myProjects.length,        sub: 'Assigned to me' },
      { label: 'Active',            value: byStatus.active || 0,     sub: 'Currently running' },
      { label: 'Awaiting Approval', value: byStatus.pending || 0,    sub: 'With the coordinator' },
      { label: 'In Progress',       value: inProgress,               sub: 'Partially complete' },
      { label: 'Assigned Complaints', value: myComplaints.length,    sub: `${myComplaints.filter(c => c.status !== 'resolved').length} open` },
      { label: 'Conflict Alerts',   value: openConflicts.length,     sub: 'Need my response', danger: true },
      { label: 'Upcoming Deadlines', value: upcomingDeadlines.length, sub: `Next ${DEADLINE_WINDOW_DAYS} days`, danger: true },
    ]
  }, [myProjects, myComplaints, openConflicts, upcomingDeadlines])

  const timelineData = useMemo(
    () => myProjects
      .filter((p) => !PROJECT_TERMINAL_STATUSES.includes(p.status))
      .map((p) => ({ label: p.title, value: scheduleElapsed(p) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [myProjects]
  )

  const statusDistribution = useMemo(() => {
    const byStatus = myProjects.reduce((m, p) => (m[p.status] = (m[p.status] || 0) + 1, m), {})
    return Object.entries(byStatus)
      .map(([k, v]) => ({ label: PROJECT_STATUS_LABELS[k] || k, value: v }))
      .sort((a, b) => b.value - a.value)
  }, [myProjects])

  // Project.progress is a current value; no progress history is stored, so this
  // is completion per project rather than a week-over-week series.
  const progressData = useMemo(
    () => myProjects
      .filter((p) => !PROJECT_TERMINAL_STATUSES.includes(p.status))
      .map((p) => ({ label: p.title, value: p.progress ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [myProjects]
  )

  const monthlyActivity = useMemo(
    () => monthlySeries(myProjects, (p) => p.submittedAt),
    [myProjects]
  )

  const recentNotifications = useMemo(
    () => [...(notifications || [])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6),
    [notifications]
  )

  const go = useCallback((to) => navigate(to), [navigate])

  const quickActions = useMemo(() => [
    { id: 'new', label: 'Create Project', hint: 'Submit for approval', to: '/officer/projects/new',
      icon: <ActionIcon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} /> },
    { id: 'projects', label: 'My Projects', hint: `${myProjects.length} assigned`, to: '/officer/projects',
      icon: <ActionIcon d={<><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>} /> },
    { id: 'conflicts', label: 'Conflict Details', hint: `${openConflicts.length} open`, to: '/officer/conflicts',
      icon: <ActionIcon d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>} /> },
    { id: 'gis', label: 'View GIS', hint: 'City map & layers', to: '/officer/map',
      icon: <ActionIcon d={<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>} /> },
  ], [myProjects, openConflicts])

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading dashboard...">
    <div className="flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>

      {upcomingDeadlines.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[8px] flex-shrink-0 bg-[#FFFBEB] dark:bg-[#181305] border border-[#FCD34D] dark:border-[#854F0B]">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#D97706] dark:text-[#FACC15] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p className="text-[13px] text-[#92400E] dark:text-[#FACC15]">
            <span className="font-semibold">
              {upcomingDeadlines.length} {upcomingDeadlines.length === 1 ? 'project ends' : 'projects end'} within {DEADLINE_WINDOW_DAYS} days —{' '}
            </span>
            next: {upcomingDeadlines[0].title} on {formatDate(upcomingDeadlines[0].endDate)}.
          </p>
        </div>
      )}

      <QuickActions actions={quickActions} onNavigate={go} />

      <StatGrid stats={stats} columns={7} />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <DashboardSection title="My project timeline">
          <BarChart
            data={timelineData}
            suffix="%"
            labelWidth={120}
            emptyHint="No scheduled projects. Elapsed share of each project's start-to-end window."
          />
        </DashboardSection>

        <DashboardSection title="Project status distribution">
          <BarChart data={statusDistribution} labelWidth={92} emptyHint="You have no projects yet." />
        </DashboardSection>

        <DashboardSection title="Project progress">
          <BarChart
            data={progressData}
            suffix="%"
            labelWidth={120}
            emptyHint="No projects in flight. Shows current completion per project."
          />
        </DashboardSection>

        <DashboardSection title="Monthly project activity">
          <TrendChart data={monthlyActivity} emptyHint="No projects submitted yet." />
        </DashboardSection>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <DashboardSection title="Assigned projects">
          <DashboardTable
            loading={loading}
            error={error}
            onRetry={reload}
            rows={myProjects}
            onRowClick={(r) => go(`/officer/projects/${r.id}`)}
            emptyTitle="No projects yet"
            emptyHint="Projects you create will appear here."
            defaultSort={{ key: 'endDate', dir: 'asc' }}
            columns={[
              { key: 'title', header: 'Project', sortable: true, className: 'font-medium max-w-[180px] truncate',
                render: (r) => <span title={r.title}>{r.title}</span> },
              { key: 'status', header: 'Status', sortable: true,
                render: (r) => <Pill>{PROJECT_STATUS_LABELS[r.status] || r.status}</Pill> },
              { key: 'progress', header: 'Progress', sortable: true, className: 'tabular-nums',
                render: (r) => `${r.progress ?? 0}%` },
              { key: 'endDate', header: 'Deadline', sortable: true,
                sortValue: (r) => new Date(r.endDate).getTime(),
                className: 'text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap',
                render: (r) => formatDate(r.endDate) },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Assigned complaints">
          <DashboardTable
            loading={loadingComplaints}
            error={complaintsError}
            rows={myComplaints}
            onRowClick={(r) => go(`/officer/complaints/${r.id}`)}
            emptyTitle="No complaints assigned to you"
            emptyHint="Complaints an administrator assigns to you will appear here."
            defaultSort={{ key: 'filedAt', dir: 'desc' }}
            columns={[
              { key: 'cnrId', header: 'CNR', sortable: true, className: 'font-mono text-[12px] whitespace-nowrap' },
              { key: 'issueType', header: 'Issue', sortable: true, className: 'max-w-[120px] truncate' },
              { key: 'status', header: 'Status', sortable: true,
                render: (r) => <Pill>{COMPLAINT_STATUS_LABELS[r.status] || r.status}</Pill> },
              { key: 'filedAt', header: 'Filed', sortable: true,
                sortValue: (r) => new Date(r.filedAt).getTime(),
                className: 'text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap',
                render: (r) => formatDate(r.filedAt) },
            ]}
          />
        </DashboardSection>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <DashboardSection title="My conflict alerts" className="xl:col-span-2">
          <DashboardTable
            loading={loadingConflicts}
            error={conflictsError}
            rows={myConflicts}
            onRowClick={(r) => go(`/officer/conflicts/${r.id}`)}
            emptyTitle="No conflicts on your projects"
            emptyHint="Clashes detected against your projects will appear here."
            defaultSort={{ key: 'detectedAt', dir: 'desc' }}
            columns={[
              { key: 'pair', header: 'Between', className: 'font-medium whitespace-nowrap',
                render: (r) => `${r.projectADept || '—'} ↔ ${r.projectBDept || '—'}` },
              { key: 'overlapDescription', header: 'Overlap', className: 'max-w-[220px] truncate text-[#6B7280] dark:text-[#9CA3AF]',
                render: (r) => <span title={r.overlapDescription}>{r.overlapDescription}</span> },
              { key: 'status', header: 'Status', sortable: true,
                render: (r) => <Pill>{r.status === 'unresolved' ? 'Unresolved' : r.status === 'pending_response' ? 'Awaiting me' : 'Resolved'}</Pill> },
              { key: 'detectedAt', header: 'Detected', sortable: true,
                sortValue: (r) => new Date(r.detectedAt).getTime(),
                className: 'text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap',
                render: (r) => formatDate(r.detectedAt) },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Recent activity">
          <AsyncState loading={loadingNotifications} error={notificationsError} label="Loading...">
            {recentNotifications.length === 0 ? (
              <p className="text-[14px] text-[#9CA3AF] text-center py-3">No recent activity</p>
            ) : (
              <div className="flex flex-col">
                {recentNotifications.map((n, i) => (
                  <div
                    key={n.id}
                    onClick={n.link ? () => go(n.link) : undefined}
                    className={[
                      'flex items-start gap-3 py-3',
                      n.link ? 'cursor-pointer' : '',
                      i < recentNotifications.length - 1 ? 'border-b border-[#F3F4F6] dark:border-[#27272A]' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                        n.read ? 'bg-[#D1D5DB] dark:bg-[#374151]' : 'bg-[#5E6AD2]',
                      ].join(' ')}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                        {n.title}
                      </p>
                      <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                    </div>
                    <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] flex-shrink-0 whitespace-nowrap">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </AsyncState>
        </DashboardSection>
      </div>

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
    </AsyncState>
  )
}
