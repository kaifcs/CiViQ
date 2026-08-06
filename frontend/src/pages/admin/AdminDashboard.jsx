// Administrator landing screen.
//
// Stat cards come from /api/dashboard/summary and the charts from the per-entity
// analytics endpoints; the recent-activity tables use the ordinary list
// endpoints. All are consumed as-is — no figure is recomputed client-side.

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useProjects, useConflicts, useComplaints, useAuditLogs,
  useDashboardSummary, useDashboardProjects, useDashboardConflicts, useDashboardComplaints,
} from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import {
  DashboardSection, BarChart, TrendChart, DashboardTable, QuickActions, StatGrid,
  Pill, ActionIcon,
  formatDate, timeAgo, daysSince,
  PROJECT_STATUS_LABELS, COMPLAINT_STATUS_LABELS, auditActionLabel } from '../../components/dashboard'

// ─── Helpers ───────────────────────────────────
const MONSOON_MONTHS = [6, 7, 8, 9]

function getMonth(dateStr) {
  return new Date(dateStr).getMonth() + 1
}

function hasMonsoonRoadProject(projects = []) {
  return projects.some(p => p.type === 'Road' && MONSOON_MONTHS.includes(getMonth(p.startDate)))
}


function getInitials(name) {
  return String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Module-level so the object identity is stable and the hook does not refetch
// on every render.
const RECENT_LIMIT = 5
const RECENT_PARAMS = { page: 1, limit: RECENT_LIMIT }

// ─── Severity Badge ────────────────────────────
function SeverityBadge({ severity }) {
  const map = {
    high:   'bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#1F0A0A] dark:text-[#F87171]',
    medium: 'bg-[#FFFBEB] text-[#92400E] dark:bg-[#181305] dark:text-[#FACC15]',
    low:    'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  }
  const labels = { high: 'High', medium: 'Medium', low: 'Low' }
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${map[severity] || map.low}`}>
      {labels[severity] || 'Low'}
    </span>
  )
}

// ─── Admin Dashboard ───────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate()

  // Summary is the page's primary read: one request covers all nine counters
  // and the status breakdown, so no widget recomputes them from list data.
  const { data: summary, loading, error, reload } = useDashboardSummary()

  // Analytics reads. /dashboard/projects serves two charts from one request.
  const { data: projectStats,   loading: loadingProjectStats,   error: projectStatsError }   = useDashboardProjects()
  const { data: conflictStats,  loading: loadingConflictStats,  error: conflictStatsError }  = useDashboardConflicts()
  const { data: complaintStats, loading: loadingComplaintStats, error: complaintStatsError } = useDashboardComplaints()

  // Full project and conflict lists already drive the seasonal warning and the
  // clash alerts, so the recent tables slice those rather than refetching.
  const { data: projects,  loading: loadingProjects,  error: projectsError }  = useProjects()
  const { data: conflicts, loading: loadingConflicts, error: conflictsError } = useConflicts()
  // Nothing else on this page needs complaints, so this one is paginated.
  const { data: complaints, loading: loadingComplaints, error: complaintsError } = useComplaints(RECENT_PARAMS)
  const { data: auditLogs } = useAuditLogs()

  // ── Stat cards — every value comes from GET /api/dashboard/summary ──
  const stats = useMemo(() => [
    { label: 'Total Projects',     value: summary?.projects?.total ?? 0,            sub: 'All departments' },
    { label: 'Active Projects',    value: summary?.projects?.active ?? 0,           sub: 'Currently in progress' },
    { label: 'Completed',          value: summary?.projects?.completed ?? 0,        sub: 'Finished works' },
    { label: 'Delayed Projects',   value: summary?.projects?.delayed ?? 0,          sub: 'Past end date', danger: true },
    { label: 'Conflicts',          value: summary?.conflicts?.total ?? 0,           sub: `${summary?.conflicts?.open ?? 0} open`, danger: (summary?.conflicts?.open ?? 0) > 0 },
    { label: 'Complaints',         value: summary?.complaints?.total ?? 0,          sub: `${summary?.complaints?.open ?? 0} unresolved` },
    { label: 'Departments',        value: summary?.departments?.total ?? 0,         sub: `${summary?.departments?.active ?? 0} active` },
    { label: 'Officers',           value: summary?.users?.byRole?.officer ?? 0,     sub: 'Field engineers' },
    { label: 'Citizens',           value: summary?.users?.byRole?.citizen ?? 0,     sub: 'Registered residents' },
  ], [summary])

  // ── Charts ──
  const projectsByDepartment = useMemo(
    () => (projectStats?.byDepartment || []).map(d => ({ label: d.code || d.name, value: d.count })),
    [projectStats]
  )

  const projectsByStatus = useMemo(() => {
    const byStatus = summary?.projects?.byStatus || {}
    return Object.entries(byStatus)
      .map(([k, v]) => ({ label: PROJECT_STATUS_LABELS[k] || k, value: v }))
      .filter(d => d.value > 0)
  }, [summary])

  const showMonsoonWarning = useMemo(() => hasMonsoonRoadProject(projects), [projects])

  // ── Tables — sliced from lists already fetched for other widgets ──
  const recentProjects = useMemo(
    () => [...(projects || [])]
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, RECENT_LIMIT),
    [projects]
  )

  const unresolvedConflicts = useMemo(
    () => (conflicts || []).filter(c => c.status === 'unresolved'),
    [conflicts]
  )

  const recentConflicts = useMemo(
    () => [...(conflicts || [])]
      .sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))
      .slice(0, RECENT_LIMIT),
    [conflicts]
  )

  const recentActivity = useMemo(
    () => [...(auditLogs || [])]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, RECENT_LIMIT),
    [auditLogs]
  )

  const go = useCallback((to) => navigate(to), [navigate])

  // Only routes that exist are offered; see the report for the two actions
  // that have no destination screen yet.
  const quickActions = useMemo(() => [
    { id: 'gis',        label: 'View GIS',         hint: 'City map & layers', to: '/admin/map',
      icon: <ActionIcon d={<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>} /> },
    { id: 'users',      label: 'Manage Users',     hint: 'Roles & access', to: '/admin/users',
      icon: <ActionIcon d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></>} /> },
    { id: 'conflicts',  label: 'Review Conflicts', hint: `${summary?.conflicts?.open ?? 0} open`, to: '/admin/conflicts',
      icon: <ActionIcon d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>} /> },
    { id: 'complaints', label: 'Review Complaints', hint: `${summary?.complaints?.open ?? 0} unresolved`, to: '/admin/complaints',
      icon: <ActionIcon d={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>} /> },
  ], [summary])

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading dashboard...">
    <div className="flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Seasonal Warning ── */}
      {showMonsoonWarning && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[8px] flex-shrink-0 bg-[#FFFBEB] dark:bg-[#181305] border border-[#FCD34D] dark:border-[#854F0B]">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#D97706] dark:text-[#FACC15] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-[13px] text-[#92400E] dark:text-[#FACC15]">
            <span className="font-semibold">Seasonal warning — </span>
            One or more road projects are scheduled during monsoon season (Jun–Sep). Consider rescheduling.
          </p>
        </div>
      )}

      {/* ── Quick actions ── */}
      <QuickActions actions={quickActions} onNavigate={go} />

      {/* ── Stat cards ── */}
      <StatGrid stats={stats} columns={5} />

      {/* ── Distribution charts ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <DashboardSection title="Projects by department">
          <AsyncState loading={loadingProjectStats} error={projectStatsError} label="Loading...">
            <BarChart data={projectsByDepartment} emptyHint="No projects have been created yet." />
          </AsyncState>
        </DashboardSection>

        <DashboardSection title="Projects by status">
          <BarChart data={projectsByStatus} labelWidth={92} emptyHint="No projects have been created yet." />
        </DashboardSection>
      </div>

      {/* ── Trends ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <DashboardSection title="Monthly project trend">
          <AsyncState loading={loadingProjectStats} error={projectStatsError} label="Loading...">
            <TrendChart data={projectStats?.monthly} emptyHint="No projects recorded yet." />
          </AsyncState>
        </DashboardSection>

        <DashboardSection title="Complaint trend">
          <AsyncState loading={loadingComplaintStats} error={complaintStatsError} label="Loading...">
            <TrendChart data={complaintStats?.monthly} color="#D97706" emptyHint="No complaints recorded yet." />
          </AsyncState>
        </DashboardSection>

        <DashboardSection title="Conflict trend">
          <AsyncState loading={loadingConflictStats} error={conflictStatsError} label="Loading...">
            <TrendChart data={conflictStats?.monthly} color="#DC2626" emptyHint="No conflicts detected yet." />
          </AsyncState>
        </DashboardSection>
      </div>

      {/* ── Recent tables ── */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <DashboardSection title="Recent projects">
          <DashboardTable
            loading={loadingProjects}
            error={projectsError}
            rows={recentProjects}
            onRowClick={(r) => go(`/admin/projects/${r.id}`)}
            emptyTitle="No projects yet"
            columns={[
              { key: 'title', header: 'Project', className: 'font-medium max-w-[160px] truncate',
                render: (r) => <span title={r.title}>{r.title}</span> },
              { key: 'department', header: 'Dept', render: (r) => <Pill>{r.department || '—'}</Pill> },
              { key: 'status', header: 'Status',
                render: (r) => <Pill>{PROJECT_STATUS_LABELS[r.status] || r.status}</Pill> },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Recent complaints">
          <DashboardTable
            loading={loadingComplaints}
            error={complaintsError}
            rows={complaints || []}
            onRowClick={(r) => go(`/admin/complaints/${r.id}`)}
            emptyTitle="No complaints yet"
            columns={[
              { key: 'cnrId', header: 'CNR', className: 'font-mono text-[12px] whitespace-nowrap' },
              { key: 'issueType', header: 'Issue', className: 'max-w-[120px] truncate' },
              { key: 'status', header: 'Status',
                render: (r) => <Pill>{COMPLAINT_STATUS_LABELS[r.status] || r.status}</Pill> },
            ]}
          />
        </DashboardSection>

        <DashboardSection title="Recent conflicts">
          <DashboardTable
            loading={loadingConflicts}
            error={conflictsError}
            rows={recentConflicts}
            onRowClick={(r) => go(`/admin/conflicts/${r.id}`)}
            emptyTitle="No conflicts detected"
            columns={[
              { key: 'pair', header: 'Between', className: 'font-medium whitespace-nowrap',
                render: (r) => `${r.projectADept || '—'} ↔ ${r.projectBDept || '—'}` },
              { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
              { key: 'detectedAt', header: 'Detected', className: 'text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap',
                render: (r) => formatDate(r.detectedAt) },
            ]}
          />
        </DashboardSection>
      </div>

      {/* ── Clash alerts + activity ── */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <DashboardSection title="Clash alerts" className="xl:col-span-2">
          {unresolvedConflicts.length === 0 ? (
            <p className="text-[14px] text-[#9CA3AF] text-center py-3">No active clashes</p>
          ) : (
            <div className="flex flex-col gap-2">
              {unresolvedConflicts.map(c => (
                <div
                  key={c.id}
                  onClick={() => go(`/admin/conflicts/${c.id}`)}
                  className="flex items-center gap-3 p-3 rounded-[6px] cursor-pointer transition-colors bg-[#FAFAFA] dark:bg-[#18181B] hover:bg-[#F3F4F6] dark:hover:bg-[#252529] border border-[#F0F0F0] dark:border-[#27272A]"
                >
                  <div
                    className="w-2 h-2 rounded-full bg-[#DC2626] flex-shrink-0"
                    style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      {c.projectADept} ↔ {c.projectBDept}
                    </p>
                    <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate mt-0.5">
                      {c.overlapDescription}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <SeverityBadge severity={c.severity} />
                    <span className="text-[12px] text-[#DC2626] dark:text-[#FCA5A5] font-medium whitespace-nowrap">
                      {daysSince(c.detectedAt)}d pending
                    </span>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#9CA3AF]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardSection>

        <DashboardSection title="Recent activity">
          {recentActivity.length === 0 ? (
            <p className="text-[14px] text-[#9CA3AF] text-center py-3">No recorded activity</p>
          ) : (
            <div className="flex flex-col">
              {recentActivity.map((log, i) => (
                <div
                  key={log.id}
                  className={[
                    'flex items-start gap-3 py-3',
                    i < recentActivity.length - 1 ? 'border-b border-[#F3F4F6] dark:border-[#27272A]' : '',
                  ].join(' ')}
                >
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border border-[#E0E7FF] dark:border-[#252870]">
                    {getInitials(log.userName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                      {log.userName}
                    </p>
                    <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">
                      {auditActionLabel(log.action)}
                    </p>
                    {log.resourceTitle && (
                      <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5 truncate">
                        {log.resourceTitle}
                      </p>
                    )}
                  </div>
                  <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] flex-shrink-0 mt-0.5 whitespace-nowrap">
                    {timeAgo(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DashboardSection>
      </div>

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
    </AsyncState>
  )
}
