// Supervisor landing screen.
//
// Scoped server-side to the projects this supervisor oversees. This screen is
// read-only: progress is recorded on /supervisor/tasks/:id, which both tables
// below link to, and reaching 100% there marks the project complete and
// notifies the owning officer.

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useConflicts, useNotifications } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import {
  DashboardSection, BarChart, TrendChart, DashboardTable, QuickActions, StatGrid,
  Pill, ActionIcon,
  formatDate, timeAgo, daysSince, monthlySeries,
  PROJECT_STATUS_LABELS, PROJECT_TERMINAL_STATUSES, conflictStatusLabel,
} from '../../components/dashboard'

// ─── Helpers ───────────────────────────────────
const isOverdue = (p) =>
  !PROJECT_TERMINAL_STATUSES.includes(p.status) &&
  !!p.endDate &&
  new Date(p.endDate).getTime() < Date.now()

// ─── Supervisor Dashboard ──────────────────────
export default function SupervisorDashboard() {
  const navigate = useNavigate()

  // GET /api/projects is filtered to `supervisor = req.user._id` by the
  // backend, so this list IS the supervisor's team workload.
  const { data: projects, loading, error, reload } = useProjects()
  const { data: conflicts, loading: loadingConflicts, error: conflictsError } = useConflicts()
  // /users, /audit and /dashboard/* are admin-only, so notifications are the
  // supervisor's authorised activity feed.
  const { data: notifications, loading: loadingNotifications, error: notificationsError } = useNotifications()

  const teamProjects = useMemo(() => projects || [], [projects])
  const teamProjectIds = useMemo(() => new Set(teamProjects.map((p) => p.id)), [teamProjects])

  // Conflicts are not role-scoped by the backend; narrow them to projects this
  // supervisor actually oversees.
  const teamConflicts = useMemo(
    () => (conflicts || []).filter((c) => teamProjectIds.has(c.projectAId) || teamProjectIds.has(c.projectBId)),
    [conflicts, teamProjectIds]
  )
  const openConflicts = useMemo(
    () => teamConflicts.filter((c) => c.status === 'unresolved'),
    [teamConflicts]
  )

  // "Pending review" = assigned to me, still live, and no progress recorded yet.
  const pendingReviews = useMemo(
    () => teamProjects.filter((p) => !PROJECT_TERMINAL_STATUSES.includes(p.status) && (p.progress ?? 0) === 0),
    [teamProjects]
  )

  const overdueProjects = useMemo(
    () => teamProjects.filter(isOverdue).sort((a, b) => new Date(a.endDate) - new Date(b.endDate)),
    [teamProjects]
  )

  // GET /users is admin-only. The team is therefore derived from the officer
  // references the backend already populates on each supervised project.
  const team = useMemo(() => {
    const byId = new Map()
    for (const p of teamProjects) {
      const id = p.officerId
      if (!id) continue
      const entry = byId.get(id) || {
        id,
        name: p.officerName || 'Unknown officer',
        email: p._raw?.officer?.email || null,
        department: p.department || null,
        projects: 0,
        progressTotal: 0,
      }
      entry.projects += 1
      entry.progressTotal += p.progress ?? 0
      byId.set(id, entry)
    }
    return [...byId.values()]
      .map((e) => ({ ...e, avgProgress: e.projects ? Math.round(e.progressTotal / e.projects) : 0 }))
      .sort((a, b) => b.projects - a.projects)
  }, [teamProjects])

  const avgProgress = useMemo(() => {
    if (teamProjects.length === 0) return 0
    return Math.round(teamProjects.reduce((s, p) => s + (p.progress ?? 0), 0) / teamProjects.length)
  }, [teamProjects])

  // ── Stats ──
  const stats = useMemo(() => {
    const active = teamProjects.filter((p) => p.status === 'active').length
    return [
      { label: 'Team Projects',   value: teamProjects.length,    sub: 'Under my supervision' },
      { label: 'Active Projects', value: active,                 sub: 'Currently running' },
      { label: 'Pending Reviews', value: pendingReviews.length,  sub: 'No progress logged' },
      { label: 'Department Team', value: team.length,            sub: 'Officers on my projects' },
      { label: 'Avg Progress',    value: `${avgProgress}%`,      sub: 'Across team projects' },
      { label: 'Conflict Alerts', value: openConflicts.length,   sub: 'Need resolution', danger: true },
      { label: 'Overdue Tasks',   value: overdueProjects.length, sub: 'Past end date', danger: true },
    ]
  }, [teamProjects, pendingReviews, team, avgProgress, openConflicts, overdueProjects])

  // ── Charts ──
  const progressByProject = useMemo(
    () => teamProjects
      .filter((p) => !PROJECT_TERMINAL_STATUSES.includes(p.status))
      .map((p) => ({ label: p.title, value: p.progress ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [teamProjects]
  )

  // actualEndDate is stamped by PUT /projects/:id/progress when progress hits
  // 100, so this series only fills as supervised work is completed.
  const completionTrend = useMemo(
    () => monthlySeries(
      teamProjects.filter((p) => p._raw?.actualEndDate),
      (p) => p._raw.actualEndDate
    ),
    [teamProjects]
  )

  const monthlyTeamProgress = useMemo(
    () => monthlySeries(teamProjects, (p) => p.submittedAt),
    [teamProjects]
  )

  const workload = useMemo(
    () => team.map((m) => ({ label: m.name, value: m.projects })).slice(0, 6),
    [team]
  )

  const recentNotifications = useMemo(
    () => [...(notifications || [])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6),
    [notifications]
  )

  const go = useCallback((to) => navigate(to), [navigate])

  // Only routes that exist for the supervisor role are offered. There is no
  // supervisor map or conflicts route — see the report.
  const quickActions = useMemo(() => [
    { id: 'tasks', label: 'Review Projects', hint: `${pendingReviews.length} awaiting review`, to: '/supervisor/tasks',
      icon: <ActionIcon d={<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>} /> },
    { id: 'settings', label: 'Settings', hint: 'Profile & preferences', to: '/supervisor/settings',
      icon: <ActionIcon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V12a2 2 0 0 1 0 4z"/></>} /> },
  ], [pendingReviews])

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading dashboard...">
    <div className="flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Overdue warning ── */}
      {overdueProjects.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[8px] flex-shrink-0 bg-[#FEF2F2] dark:bg-[#1F0A0A] border border-[#FCA5A5] dark:border-[#7F1D1D]">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] dark:text-[#FCA5A5] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[13px] text-[#B91C1C] dark:text-[#FCA5A5]">
            <span className="font-semibold">
              {overdueProjects.length} {overdueProjects.length === 1 ? 'project is' : 'projects are'} past their end date —{' '}
            </span>
            oldest: {overdueProjects[0].title}, {daysSince(overdueProjects[0].endDate)}d overdue.
          </p>
        </div>
      )}

      <QuickActions actions={quickActions} onNavigate={go} />

      {/* ── Stat cards ── */}
      <StatGrid stats={stats} columns={7} />

      {/* ── Charts ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <DashboardSection title="Department project progress">
          <BarChart
            data={progressByProject}
            suffix="%"
            labelWidth={120}
            emptyHint="No live projects. Shows recorded completion per project."
          />
        </DashboardSection>

        <DashboardSection title="Team workload distribution">
          <BarChart
            data={workload}
            labelWidth={120}
            emptyHint="No officers assigned to your projects yet."
          />
        </DashboardSection>

        <DashboardSection title="Project completion trend">
          <TrendChart
            data={completionTrend}
            color="#16A34A"
            emptyHint="No projects completed yet. Fills as progress reaches 100%."
          />
        </DashboardSection>

        <DashboardSection title="Monthly team progress">
          <TrendChart data={monthlyTeamProgress} emptyHint="No projects assigned yet." />
        </DashboardSection>
      </div>

      {/* ── Tables ── */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <DashboardSection title="Team projects">
          <DashboardTable
            loading={loading}
            error={error}
            onRetry={reload}
            rows={teamProjects}
            onRowClick={(r) => go(`/supervisor/tasks/${r.id}`)}
            emptyTitle="No projects assigned"
            emptyHint="Projects where you are named supervisor will appear here."
            defaultSort={{ key: 'endDate', dir: 'asc' }}
            columns={[
              { key: 'title', header: 'Project', sortable: true, className: 'font-medium max-w-[170px] truncate',
                render: (r) => <span title={r.title}>{r.title}</span> },
              { key: 'officerName', header: 'Officer', sortable: true, className: 'max-w-[110px] truncate',
                render: (r) => r.officerName || '—' },
              { key: 'progress', header: 'Progress', sortable: true, className: 'tabular-nums',
                render: (r) => `${r.progress ?? 0}%` },
              { key: 'endDate', header: 'Deadline', sortable: true,
                sortValue: (r) => new Date(r.endDate).getTime(),
                className: 'whitespace-nowrap',
                render: (r) => (
                  <span className={isOverdue(r) ? 'text-[#DC2626] dark:text-[#FCA5A5] font-medium' : 'text-[#6B7280] dark:text-[#9CA3AF]'}>
                    {formatDate(r.endDate)}
                  </span>
                ) },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Pending reviews">
          <DashboardTable
            loading={loading}
            error={error}
            rows={pendingReviews}
            onRowClick={(r) => go(`/supervisor/tasks/${r.id}`)}
            emptyTitle="Nothing awaiting review"
            emptyHint="Live projects with no recorded progress appear here."
            defaultSort={{ key: 'endDate', dir: 'asc' }}
            columns={[
              { key: 'title', header: 'Project', sortable: true, className: 'font-medium max-w-[170px] truncate',
                render: (r) => <span title={r.title}>{r.title}</span> },
              { key: 'status', header: 'Status', sortable: true,
                render: (r) => <Pill>{PROJECT_STATUS_LABELS[r.status] || r.status}</Pill> },
              { key: 'endDate', header: 'Deadline', sortable: true,
                sortValue: (r) => new Date(r.endDate).getTime(),
                className: 'text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap',
                render: (r) => formatDate(r.endDate) },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Department team">
          <DashboardTable
            loading={loading}
            error={error}
            rows={team}
            emptyTitle="No team members yet"
            emptyHint="Officers running your supervised projects appear here."
            defaultSort={{ key: 'projects', dir: 'desc' }}
            columns={[
              { key: 'name', header: 'Officer', sortable: true, className: 'font-medium max-w-[150px] truncate',
                render: (r) => <span title={r.email || r.name}>{r.name}</span> },
              { key: 'department', header: 'Dept', render: (r) => <Pill>{r.department || '—'}</Pill> },
              { key: 'projects', header: 'Projects', sortable: true, className: 'tabular-nums' },
              { key: 'avgProgress', header: 'Avg', sortable: true, className: 'tabular-nums',
                render: (r) => `${r.avgProgress}%` },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Recent conflict alerts">
          <DashboardTable
            loading={loadingConflicts}
            error={conflictsError}
            rows={teamConflicts}
            emptyTitle="No conflicts on your projects"
            emptyHint="Clashes detected against supervised projects appear here."
            defaultSort={{ key: 'detectedAt', dir: 'desc' }}
            columns={[
              { key: 'pair', header: 'Between', className: 'font-medium whitespace-nowrap',
                render: (r) => `${r.projectADept || '—'} ↔ ${r.projectBDept || '—'}` },
              { key: 'overlapDescription', header: 'Overlap',
                className: 'max-w-[180px] truncate text-[#6B7280] dark:text-[#9CA3AF]',
                render: (r) => <span title={r.overlapDescription}>{r.overlapDescription}</span> },
              { key: 'status', header: 'Status', sortable: true,
                render: (r) => <Pill>{conflictStatusLabel(r.status)}</Pill> },
              { key: 'detectedAt', header: 'Detected', sortable: true,
                sortValue: (r) => new Date(r.detectedAt).getTime(),
                className: 'text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap',
                render: (r) => formatDate(r.detectedAt) },
            ]}
          />
        </DashboardSection>
      </div>

      {/* ── Activity ── */}
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
                    <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">{n.title}</p>
                    <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 line-clamp-2">{n.message}</p>
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
    </AsyncState>
  )
}
