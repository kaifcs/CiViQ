// Conflict queue awaiting administrator decision. The administrator is the only
// role that can resolve a clash — approving both works or rejecting the
// lower-scoring one — so this list is the entry point to the resolution flow.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConflicts, useDepartmentOptions } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { CONFLICT_STATUS_CONFIG, DEPT_STYLES, SEVERITY_CONFIG, scoreColor } from '../../components/uiStyles'
import { daysSince } from '../../components/dashboard'


function Badge({ label, className }) {
  return (
    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${className}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }) {
  const c = CONFLICT_STATUS_CONFIG[status] || CONFLICT_STATUS_CONFIG.unresolved
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.color}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {c.text}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const c = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low
  return (
    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${c.bg} ${c.color}`}>
      {c.text}
    </span>
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
      style={{ minWidth: '160px'  }}
      className="h-9 px-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function ConflictCard({ conflict, onClick }) {
  const days       = daysSince(conflict.detectedAt)
  const isUnresolved = conflict.status === 'unresolved'

  return (
    <div
      onClick={onClick}
      className="px-5 py-4 bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] cursor-pointer transition-all hover:border-[#5E6AD2]/40 dark:hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529] flex flex-col gap-3"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-start gap-4">

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
            {conflict.projectATitle}
          </p>
          <div className="flex items-center gap-2">
            <Badge label={conflict.projectADept} className={DEPT_STYLES[conflict.projectADept] || DEPT_STYLES.PWD} />
            <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">MCDM</span>
            <span className="text-[14px] font-bold" style={{ color: scoreColor(conflict.projectAScore) }}>
              {conflict.projectAScore}
            </span>
          </div>
        </div>

        <div className="flex items-center pt-1 flex-shrink-0">
          <span className="text-[11px] font-bold text-[#9CA3AF] dark:text-[#6B7280] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] px-2.5 py-1 rounded-full">
            VS
          </span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5 items-end">
          <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug text-right">
            {conflict.projectBTitle}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">MCDM</span>
            <span className="text-[14px] font-bold" style={{ color: scoreColor(conflict.projectBScore) }}>
              {conflict.projectBScore}
            </span>
            <Badge label={conflict.projectBDept} className={DEPT_STYLES[conflict.projectBDept] || DEPT_STYLES.PWD} />
          </div>
        </div>

      </div>

      <div className="border-t border-[#F3F4F6] dark:border-[#27272A]" />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" className="text-[#9CA3AF] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate">
            {conflict.overlapDescription}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeverityBadge severity={conflict.severity} />
          <StatusBadge   status={conflict.status} />
          <div className="w-px h-4 bg-[#E5E5E5] dark:bg-[#27272A]" />
          <span className={`text-[12px] font-medium ${isUnresolved ? 'text-[#DC2626] dark:text-[#FCA5A5]' : 'text-[#9CA3AF] dark:text-[#6B7280]'}`}>
            {days}d {isUnresolved ? 'pending' : 'ago'}
          </span>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>

    </div>
  )
}

export default function AdminConflicts() {
  const navigate = useNavigate()
  const { data: conflicts, loading, error, reload } = useConflicts()
  const departmentOptions = useDepartmentOptions()

  const [search,         setSearch]         = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterDept,     setFilterDept]     = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')

  const unresolvedCount      = conflicts.filter(c => c.status === 'unresolved').length
  const pendingResponseCount = conflicts.filter(c => c.status === 'pending_response').length
  const resolvedCount        = conflicts.filter(c => c.status === 'resolved').length

  const filtered = useMemo(() => {
    return conflicts.filter(c => {
      if (search && (
        !c.projectATitle.toLowerCase().includes(search.toLowerCase()) &&
        !c.projectBTitle.toLowerCase().includes(search.toLowerCase()) &&
        !c.projectADept.toLowerCase().includes(search.toLowerCase()) &&
        !c.projectBDept.toLowerCase().includes(search.toLowerCase())
      )) return false
      if (filterStatus   && c.status !== filterStatus)     return false
      if (filterSeverity && c.severity !== filterSeverity) return false
      if (filterDept     && c.projectADept !== filterDept && c.projectBDept !== filterDept) return false
      return true
    })
  }, [conflicts, search, filterStatus, filterDept, filterSeverity])

  const hasFilters = search || filterStatus || filterDept || filterSeverity

  function clearFilters() {
    setSearch('')
    setFilterStatus('')
    setFilterDept('')
    setFilterSeverity('')
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading conflicts...">
    <div className="flex flex-col gap-5 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex gap-3 flex-shrink-0">
        {[
          { label: 'Unresolved',       sub: 'Needs action',    value: unresolvedCount,      danger: true  },
          { label: 'Pending Response', sub: 'Awaiting officer', value: pendingResponseCount, danger: false },
          { label: 'Resolved',         sub: 'Completed',        value: resolvedCount,        danger: false },
        ].map(s => (
          <div
            key={s.label}
            className="flex flex-col rounded-[8px] p-5 bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
            style={{
              borderTopWidth: '2px',
              borderTopColor: '#5E6AD2',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              minWidth: '180px',
            }}
          >
            <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">
              {s.label}
            </p>
            <p className={`text-[36px] font-bold leading-none mb-1 ${s.danger && s.value > 0 ? 'text-[#DC2626] dark:text-[#FCA5A5]' : 'text-[#0F172A] dark:text-[#F8FAFC]'}`}>
              {s.value}
            </p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="relative flex items-center">
          <span className="absolute left-3 text-[#9CA3AF] pointer-events-none flex items-center">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by project name or department..."
            className="w-full h-10 pl-10 pr-4 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <FilterSelect label="Status"     value={filterStatus}   onChange={setFilterStatus}
            options={[
              { value: 'unresolved',       label: 'Unresolved' },
              { value: 'pending_response', label: 'Pending Response' },
              { value: 'resolved',         label: 'Resolved' },
            ]}
          />
          <FilterSelect label="Department" value={filterDept}     onChange={setFilterDept}
            options={departmentOptions}
          />
          <FilterSelect label="Severity"   value={filterSeverity} onChange={setFilterSeverity}
            options={[
              { value: 'high',   label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low',    label: 'Low' },
            ]}
          />
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
              {filtered.length} {filtered.length === 1 ? 'conflict' : 'conflicts'}
            </span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mb-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No conflicts found</p>
            <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">Try adjusting your filters</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-4 text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          filtered.map(conflict => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onClick={() => navigate(`/admin/conflicts/${conflict.id}`)}
            />
          ))
        )}
      </div>

    </div>
    </AsyncState>
  )
}