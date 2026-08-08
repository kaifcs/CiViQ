// Project register across all departments. Unscoped: an administrator sees every
// project, where OfficerProjects shows the same shape narrowed by the backend.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useDepartmentOptions } from '../../hooks/useResources'
import { useAuth } from '../../hooks/useAuth'
import AsyncState from '../../components/AsyncState'
import { projectsApi, normaliseError } from '../../services'
import { deptStyle, PROJECT_STATUS_CONFIG, PROJECT_STATUS_OPTIONS, TYPE_STYLES } from '../../components/uiStyles'
import { formatDate } from '../../components/dashboard'

function isThisMonth(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

function isNextThreeMonths(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const threeMonths = new Date(now)
  threeMonths.setMonth(threeMonths.getMonth() + 3)
  return d >= now && d <= threeMonths
}

function isOverdue(project) {
  const end = new Date(project.endDate)
  return end < new Date() && project.status !== 'rejected' && project.status !== 'approved'
}

function Badge({ label, className }) {
  return (
    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${className}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }) {
  const c = PROJECT_STATUS_CONFIG[status] || PROJECT_STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${c.bg} ${c.color}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {c.text}
    </span>
  )
}

function MCDMScore({ score }) {
  const color = score >= 75 ? '#16A34A' : score >= 60 ? '#D97706' : '#DC2626'
  return (
    <div className="flex flex-col items-end gap-0.5 min-w-[52px]">
      <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">MCDM</span>
      <span className="text-[18px] font-bold leading-none" style={{ color }}>{score}</span>
    </div>
  )
}

const SearchIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ minWidth: '160px' }}
      className="h-9 px-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function ProjectCard({ project, onClick, onRestore, restoring }) {
  // A deleted project has no detail route — every read path hides it — so the
  // card stops being a link and offers the one action that still applies.
  const deleted = project.isActive === false
  return (
    <div
      onClick={deleted ? undefined : onClick}
      className={`flex items-center gap-5 px-5 py-4 border rounded-[8px] transition-all ${
        deleted
          ? 'bg-[#F8FAFC] dark:bg-[#18181B] border-dashed border-[#CBD5E1] dark:border-[#3F3F46] opacity-90'
          : 'bg-[#FFFFFF] dark:bg-[#1C1C1F] border-[#E5E5E5] dark:border-[#27272A] cursor-pointer hover:border-[#5E6AD2]/40 dark:hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529]'
      }`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex-1 min-w-0">
        {(project.hasClash || project.phase === 'phased') && (
          <div className="flex items-center gap-2 mb-1.5">
            {project.hasClash && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B91C1C] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#1F0A0A] px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }} />
                Clash detected
              </span>
            )}
            {project.phase === 'phased' && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF] px-2 py-0.5 rounded-full border border-[#E2E8F0] dark:border-[#27272A]"
                title="This is part of a multi-phase project. Future phases will be submitted separately."
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                Phased
              </span>
            )}
          </div>
        )}
        <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate leading-snug">
          {project.title}
        </p>
        <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">
          {project.departmentFull}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge label={project.department} className={deptStyle(project.department)} />
        <Badge label={project.type}       className={TYPE_STYLES[project.type] || TYPE_STYLES.Other} />
      </div>

      <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />

      <div className="flex-shrink-0 w-[110px] flex justify-center">
        <StatusBadge status={project.status} />
      </div>

      <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />

      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Timeline</span>
          <span className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">
            {formatDate(project.startDate)} – {formatDate(project.endDate)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Ward</span>
          <span className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{project.ward}</span>
        </div>
        <MCDMScore score={project.mcdmScore} />
        {deleted ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRestore(project) }}
            disabled={restoring}
            className="h-8 px-3 text-[12px] font-medium text-[#5E6AD2] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#EEF2FF] dark:hover:bg-[#131629] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {restoring ? 'Restoring...' : 'Restore'}
          </button>
        ) : (
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        )}
      </div>

    </div>
  )
}

export default function AdminProjects() {
  const navigate = useNavigate()
  const { deptMap } = useAuth()

  // Soft-deleted projects are excluded from every read path, so seeing them is
  // an explicit administrator opt-in rather than a client-side filter.
  const [showDeleted, setShowDeleted] = useState(false)
  const listParams = useMemo(
    () => (showDeleted ? { includeDeleted: 'true' } : undefined),
    [showDeleted]
  )
  const { data: projects, loading, error, reload } = useProjects(listParams)
  const departmentOptions = useDepartmentOptions()

  const [restoringId, setRestoringId] = useState(null)
  const [restoreError, setRestoreError] = useState('')

  const [search,       setSearch]       = useState('')
  const [filterDept,   setFilterDept]   = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTime,   setFilterTime]   = useState('')

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (search       && !p.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterDept   && p.department !== filterDept)   return false
      if (filterType   && p.type !== filterType)         return false
      if (filterStatus && p.status !== filterStatus)     return false
      if (filterTime) {
        if (filterTime === 'this_month'    && !isThisMonth(p.startDate))       return false
        if (filterTime === 'next_3_months' && !isNextThreeMonths(p.startDate)) return false
        if (filterTime === 'overdue'       && !isOverdue(p))                   return false
      }
      return true
    })
  }, [projects, search, filterDept, filterType, filterStatus, filterTime])

  const hasFilters = search || filterDept || filterType || filterStatus || filterTime

  function clearFilters() {
    setSearch('')
    setFilterDept('')
    setFilterType('')
    setFilterStatus('')
    setFilterTime('')
  }

  // PATCH /api/projects/:id/status — the same route soft-delete uses, with the
  // flag inverted. The list is re-read afterwards so the row leaves the deleted
  // view rather than lingering with a stale flag.
  async function handleRestore(project) {
    if (restoringId) return
    setRestoreError('')
    setRestoringId(project.id)
    try {
      await projectsApi.setStatus(project.id, true, deptMap)
      reload()
    } catch (err) {
      setRestoreError(normaliseError(err).message)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading projects...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="relative flex items-center">
          <span className="absolute left-3 text-[#9CA3AF] pointer-events-none flex items-center">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects by name..."
            className="w-full h-10 pl-10 pr-4 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <FilterSelect
            label="Department"
            value={filterDept}
            onChange={setFilterDept}
            options={departmentOptions}
          />
          <FilterSelect
            label="Type"
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: 'Road',       label: 'Road' },
              { value: 'Water',      label: 'Water' },
              { value: 'Sewage',     label: 'Sewage' },
              { value: 'Electrical', label: 'Electrical' },
              { value: 'Parks',      label: 'Parks' },
            ]}
          />
          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={PROJECT_STATUS_OPTIONS}
          />
          <FilterSelect
            label="Timeline"
            value={filterTime}
            onChange={setFilterTime}
            options={[
              { value: 'this_month',    label: 'Starting this month' },
              { value: 'next_3_months', label: 'Starting next 3 months' },
              { value: 'overdue',       label: 'Overdue' },
            ]}
          />

          <div className="flex items-center gap-3 ml-auto">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={e => setShowDeleted(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#5E6AD2] cursor-pointer"
              />
              <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Include deleted</span>
            </label>
            <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
              {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
            </span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {restoreError && (
          <p role="alert" className="text-[12px] text-[#DC2626] dark:text-[#F87171]">{restoreError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mb-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No projects found</p>
            <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">Try adjusting your search or filters</p>
            <button onClick={clearFilters} className="mt-4 text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
              Clear all filters
            </button>
          </div>
        ) : (
          filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/admin/projects/${project.id}`)}
              onRestore={handleRestore}
              restoring={restoringId === project.id}
            />
          ))
        )}
      </div>

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
    </AsyncState>
  )
}