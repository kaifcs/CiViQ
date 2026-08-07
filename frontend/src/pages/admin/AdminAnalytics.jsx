// Municipality-wide analytics. Every figure comes from /api/dashboard/*;
// nothing is computed from a project list here.

import { useCallback, useMemo, useState } from 'react'
import {
  useDashboardSummary, useDashboardProjects, useDashboardConflicts,
  useDashboardComplaints, useDashboardDepartments,
} from '../../hooks/useResources'
import { useAuth } from '../../hooks/useAuth'
import AsyncState from '../../components/AsyncState'
import {
  DashboardSection, DashboardFilters, BarChart, TrendChart, DashboardTable, StatGrid,
  toCsv, downloadCsv, filterSuffix,
  percent, formatDays, toTrendSeries,
  PROJECT_STATUSES, COMPLAINT_STATUSES, STATUS_LABELS,
  CONFLICT_RAW_STATUS_LABELS, CONFLICT_SEVERITY_LABELS,
} from '../../components/dashboard'

const LABEL = STATUS_LABELS

// Turns a { key: count } bucket map into sorted chart rows, dropping zeroes.
const bucketsToRows = (buckets = {}, labels = LABEL) =>
  Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: labels[k] || k, value: v }))
    .sort((a, b) => b.value - a.value)

const EMPTY = {}

// Declared at module scope so it is not re-created on every render.
function ExportButton({ onExport, disabled }) {
  return (
    <button
      onClick={onExport}
      disabled={disabled}
      className="text-[12px] font-medium text-[#5E6AD2] hover:text-[#4A56C1] disabled:text-[#D1D5DB] disabled:cursor-not-allowed transition-colors"
    >
      Export CSV
    </button>
  )
}

export default function AdminAnalytics() {
  const [filters, setFilters] = useState(EMPTY)

  // A single memoised params object drives every analytics hook, so one filter
  // change produces one refetch per endpoint rather than one per widget.
  const params = useMemo(() => {
    const p = {}
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v
    return Object.keys(p).length ? p : undefined
  }, [filters])

  const summaryQ    = useDashboardSummary(params)
  const projectsQ   = useDashboardProjects(params)
  const conflictsQ  = useDashboardConflicts(params)
  const complaintsQ = useDashboardComplaints(params)
  const deptQ       = useDashboardDepartments(params)
  // AuthContext already loads the department index on sign-in; reusing it keeps
  // the filter's option list unfiltered without a second /departments request.
  const { deptMap } = useAuth()
  const departmentList = useMemo(
    () => [...(deptMap?.values() || [])].map((d) => ({ id: d._id, code: d.code, name: d.name })),
    [deptMap]
  )

  const summary = summaryQ.data
  const projects = projectsQ.data
  const conflicts = conflictsQ.data
  const complaints = complaintsQ.data
  const departments = deptQ.data

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])
  const resetFilters = useCallback(() => setFilters(EMPTY), [])

  // Ward options come from the data itself — there is no ward directory.
  const wardOptions = useMemo(() => {
    const seen = new Set()
    for (const row of [...(projects?.byWard || []), ...(complaints?.byWard || [])]) {
      if (row.ward) seen.add(row.ward)
    }
    return [...seen].sort().map((w) => ({ value: w, label: w }))
  }, [projects, complaints])

  const filterFields = useMemo(() => [
    { key: 'from', label: 'From', type: 'date' },
    { key: 'to', label: 'To', type: 'date' },
    { key: 'department', label: 'Department',
      options: (departmentList || []).map((d) => ({ value: d.id, label: d.code || d.name })) },
    { key: 'ward', label: 'Ward', options: wardOptions },
    { key: 'status', label: 'Project status',
      options: PROJECT_STATUSES.map((s) => ({ value: s, label: LABEL[s] })) },
    { key: 'complaintStatus', label: 'Complaint status',
      options: COMPLAINT_STATUSES.map((s) => ({ value: s, label: LABEL[s] })) },
  ], [departmentList, wardOptions])

  // Every KPI value is computed by the backend.
  const conflictResolutionRate = useMemo(() => {
    const total = summary?.conflicts?.total ?? 0
    if (total === 0) return null
    return ((summary?.conflicts?.resolved ?? 0) / total) * 100
  }, [summary])

  const kpis = useMemo(() => [
    { label: 'Total Projects',     value: summary?.projects?.total ?? 0,      sub: 'In scope' },
    { label: 'Active Projects',    value: summary?.projects?.active ?? 0,     sub: 'Currently running' },
    { label: 'Completed',          value: summary?.projects?.completed ?? 0,  sub: 'Finished works' },
    { label: 'Total Complaints',   value: summary?.complaints?.total ?? 0,    sub: `${summary?.complaints?.open ?? 0} open` },
    { label: 'Active Conflicts',   value: summary?.conflicts?.open ?? 0,      sub: 'Unresolved', danger: true },
    { label: 'Conflict Resolution', value: conflictResolutionRate === null ? '—' : percent(conflictResolutionRate), sub: 'Share resolved' },
    { label: 'Avg Dept Progress',  value: percent(projects?.averages?.progress),  sub: 'Across departments' },
    { label: 'Avg Schedule Offset',     value: formatDays(projects?.averages?.completionDays),
      sub: `${projects?.averages?.completedCount ?? 0} completed` },
    { label: 'Avg Resolution',     value: formatDays(complaints?.averages?.resolutionDays),
      sub: `${complaints?.averages?.resolvedCount ?? 0} resolved` },
  ], [summary, projects, complaints, conflictResolutionRate])

  // Chart datasets, all from backend aggregations.
  const projectsByDept = useMemo(
    () => (projects?.byDepartment || []).map((d) => ({ label: d.code || d.name, value: d.count })),
    [projects]
  )
  const projectsByStatus = useMemo(() => bucketsToRows(projects?.byStatus), [projects])
  const complaintsByStatus = useMemo(() => bucketsToRows(complaints?.byStatus), [complaints])
  const projectsByWard = useMemo(
    () => (projects?.byWard || []).map((w) => ({ label: w.ward, value: w.count })),
    [projects]
  )
  const complaintsByWard = useMemo(
    () => (complaints?.byWard || []).map((w) => ({ label: w.ward, value: w.count })),
    [complaints]
  )
  const conflictHotspots = useMemo(
    () => (conflicts?.byWard || []).map((w) => ({ label: w.ward, value: w.count })),
    [conflicts]
  )
  const departmentPerformance = useMemo(
    () => (departments?.departments || [])
      .filter((d) => d.projects > 0)
      .map((d) => ({ label: d.code || d.name, value: Math.round(d.avgProgress ?? 0) })),
    [departments]
  )
  const completionByDept = useMemo(
    () => (departments?.departments || [])
      .filter((d) => d.completed > 0)
      .map((d) => ({ label: d.code || d.name, value: d.completed })),
    [departments]
  )

  // The analytics endpoints key monthly buckets as `period`; TrendChart reads
  // `month`, so the series are mapped once here rather than in the chart.
  const projectTrend   = useMemo(() => toTrendSeries(projects?.monthly), [projects])
  const complaintTrend = useMemo(() => toTrendSeries(complaints?.monthly), [complaints])
  const conflictTrend  = useMemo(() => toTrendSeries(conflicts?.monthly), [conflicts])

  const deptRows = useMemo(() => departments?.departments || [], [departments])

  const conflictRows = useMemo(() => {
    const byStatus = conflicts?.byStatus || {}
    const bySeverity = conflicts?.bySeverity || {}
    return [
      ...Object.entries(byStatus).map(([k, v]) => ({
        id: `s-${k}`, metric: 'Status', bucket: CONFLICT_RAW_STATUS_LABELS[k] || k, count: v,
      })),
      ...Object.entries(bySeverity).map(([k, v]) => ({
        id: `v-${k}`, metric: 'Severity', bucket: CONFLICT_SEVERITY_LABELS[k] || k, count: v,
      })),
    ].filter((r) => r.count > 0)
  }, [conflicts])

  const completionRows = useMemo(
    () => (departments?.departments || []).map((d) => ({
      id: d._id,
      code: d.code || d.name,
      projects: d.projects,
      completed: d.completed,
      rate: d.projects ? Math.round((d.completed / d.projects) * 100) : 0,
      avgProgress: Math.round(d.avgProgress ?? 0),
    })),
    [departments]
  )

  // CSV only; the backend exposes no export endpoint.
  const exportCsv = useCallback((name, columns, rows) => {
    downloadCsv(`civiq_${name}${filterSuffix(filters)}.csv`, toCsv(columns, rows))
  }, [filters])

  const loading = summaryQ.loading
  const error = summaryQ.error

  return (
    <AsyncState loading={loading} error={error} onRetry={summaryQ.reload} label="Loading analytics...">
    <div className="flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>

      <DashboardSection title="Filters">
        <DashboardFilters
          fields={filterFields}
          values={filters}
          onChange={setFilter}
          onReset={resetFilters}
        />
      </DashboardSection>

      <StatGrid stats={kpis} columns={5} />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <DashboardSection title="Monthly project trend">
          <AsyncState loading={projectsQ.loading} error={projectsQ.error} label="Loading...">
            <TrendChart data={projectTrend} emptyHint="No projects in this range." />
          </AsyncState>
        </DashboardSection>
        <DashboardSection title="Monthly complaint trend">
          <AsyncState loading={complaintsQ.loading} error={complaintsQ.error} label="Loading...">
            <TrendChart data={complaintTrend} color="#D97706" emptyHint="No complaints in this range." />
          </AsyncState>
        </DashboardSection>
        <DashboardSection title="Conflict trend">
          <AsyncState loading={conflictsQ.loading} error={conflictsQ.error} label="Loading...">
            <TrendChart data={conflictTrend} color="#DC2626" emptyHint="No conflicts in this range." />
          </AsyncState>
        </DashboardSection>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <DashboardSection title="Projects by department">
          <BarChart data={projectsByDept} emptyHint="No projects in this range." />
        </DashboardSection>
        <DashboardSection title="Projects by status">
          <BarChart data={projectsByStatus} labelWidth={92} emptyHint="No projects in this range." />
        </DashboardSection>
        <DashboardSection title="Complaint status distribution">
          <BarChart data={complaintsByStatus} labelWidth={92} emptyHint="No complaints in this range." />
        </DashboardSection>
        <DashboardSection title="Department performance">
          <BarChart data={departmentPerformance} suffix="%" emptyHint="No departments with projects." />
        </DashboardSection>
        <DashboardSection title="Project completion timeline">
          <BarChart data={completionByDept} emptyHint="No completed projects in this range." />
        </DashboardSection>
        <DashboardSection title="Conflict hotspot distribution">
          <BarChart data={conflictHotspots} labelWidth={92} emptyHint="No conflicts in this range." />
        </DashboardSection>
        <DashboardSection title="Projects by ward">
          <BarChart data={projectsByWard} labelWidth={92} emptyHint="No projects in this range." />
        </DashboardSection>
        <DashboardSection title="Complaints by ward">
          <BarChart data={complaintsByWard} labelWidth={92} emptyHint="No complaints in this range." />
        </DashboardSection>
      </div>

      <DashboardSection
        title="Department performance summary"
        action={<ExportButton disabled={deptRows.length === 0} onExport={() => exportCsv('departments', [
          { key: 'code', header: 'Code' }, { key: 'name', header: 'Department' },
          { key: 'projects', header: 'Projects' }, { key: 'completed', header: 'Completed' },
          { key: 'complaints', header: 'Complaints' },
          { key: 'avgProgress', header: 'Avg progress %', value: (r) => Math.round(r.avgProgress ?? 0) },
        ], deptRows)} />}
      >
        <DashboardTable
          loading={deptQ.loading}
          error={deptQ.error}
          onRetry={deptQ.reload}
          rows={deptRows}
          getRowKey={(r) => r._id}
          emptyTitle="No departments match these filters"
          defaultSort={{ key: 'projects', dir: 'desc' }}
          columns={[
            { key: 'code', header: 'Dept', sortable: true, className: 'font-medium' },
            { key: 'name', header: 'Name', sortable: true, className: 'max-w-[190px] truncate' },
            { key: 'projects', header: 'Projects', sortable: true, className: 'tabular-nums' },
            { key: 'completed', header: 'Completed', sortable: true, className: 'tabular-nums' },
            { key: 'complaints', header: 'Complaints', sortable: true, className: 'tabular-nums' },
            { key: 'avgProgress', header: 'Avg progress', sortable: true, className: 'tabular-nums',
              sortValue: (r) => r.avgProgress ?? 0, render: (r) => percent(r.avgProgress) },
          ]}
        />
      </DashboardSection>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <DashboardSection
          title="Conflict summary"
          action={<ExportButton disabled={conflictRows.length === 0} onExport={() => exportCsv('conflicts', [
            { key: 'metric', header: 'Metric' }, { key: 'bucket', header: 'Bucket' }, { key: 'count', header: 'Count' },
          ], conflictRows)} />}
        >
          <DashboardTable
            loading={conflictsQ.loading}
            error={conflictsQ.error}
            rows={conflictRows}
            emptyTitle="No conflicts match these filters"
            defaultSort={{ key: 'count', dir: 'desc' }}
            columns={[
              { key: 'metric', header: 'Metric', sortable: true, className: 'font-medium' },
              { key: 'bucket', header: 'Bucket', sortable: true },
              { key: 'count', header: 'Count', sortable: true, className: 'tabular-nums' },
            ]}
          />
        </DashboardSection>

        <DashboardSection
          title="Project completion summary"
          action={<ExportButton disabled={completionRows.length === 0} onExport={() => exportCsv('completion', [
            { key: 'code', header: 'Dept' }, { key: 'projects', header: 'Projects' },
            { key: 'completed', header: 'Completed' }, { key: 'rate', header: 'Completion %' },
            { key: 'avgProgress', header: 'Avg progress %' },
          ], completionRows)} />}
        >
          <DashboardTable
            loading={deptQ.loading}
            error={deptQ.error}
            rows={completionRows}
            emptyTitle="No departments match these filters"
            defaultSort={{ key: 'rate', dir: 'desc' }}
            columns={[
              { key: 'code', header: 'Dept', sortable: true, className: 'font-medium' },
              { key: 'projects', header: 'Projects', sortable: true, className: 'tabular-nums' },
              { key: 'completed', header: 'Completed', sortable: true, className: 'tabular-nums' },
              { key: 'rate', header: 'Completion', sortable: true, className: 'tabular-nums',
                render: (r) => `${r.rate}%` },
              { key: 'avgProgress', header: 'Avg progress', sortable: true, className: 'tabular-nums',
                render: (r) => `${r.avgProgress}%` },
            ]}
          />
        </DashboardSection>
      </div>

    </div>
    </AsyncState>
  )
}
