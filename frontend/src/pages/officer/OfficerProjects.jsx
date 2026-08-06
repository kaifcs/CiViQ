// The officer's own project register.
//
// Scoped server-side to projects this officer owns; the screen never filters by
// owner itself.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { PROJECT_STATUS_CONFIG, TYPE_STYLES } from '../../components/uiStyles'
import { formatDate } from '../../components/dashboard'

// Measured against the real clock. The status exclusions below are unchanged.
function isThisMonth(dateStr) {
  const d = new Date(dateStr), now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}
function isNextThreeMonths(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const threeMonths = new Date(now)
  threeMonths.setMonth(threeMonths.getMonth() + 3)
  return d >= now && d <= threeMonths
}
function isOverdue(p) {
  return new Date(p.endDate) < new Date() && p.status !== 'rejected' && p.status !== 'approved'
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ minWidth: '150px', paddingRight: '32px' }}
      className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

const SearchIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

const VDivider = () => <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />

export default function OfficerProjects() {
  const navigate = useNavigate()
  const { data: projects, loading, error, reload } = useProjects()

  const [search, setSearch]           = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTime, setFilterTime]   = useState('')

  // GET /api/projects is already officer-scoped by the backend. The empty-array
  // fallback lives inside the memo so it cannot produce a fresh identity on
  // every render.
  const filtered = useMemo(() => (projects || []).filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType   && p.type !== filterType)     return false
    if (filterStatus && p.status !== filterStatus) return false
    if (filterTime === 'this_month'    && !isThisMonth(p.startDate))       return false
    if (filterTime === 'next_3_months' && !isNextThreeMonths(p.startDate)) return false
    if (filterTime === 'overdue'       && !isOverdue(p))                   return false
    return true
  }), [search, filterType, filterStatus, filterTime, projects])

  const hasFilters = search || filterType || filterStatus || filterTime
  function clearFilters() { setSearch(''); setFilterType(''); setFilterStatus(''); setFilterTime('') }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading projects...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Search + filters + new project */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 text-[#9CA3AF] pointer-events-none flex items-center top-1/2 -translate-y-1/2"><SearchIcon /></span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search my projects..."
              className="w-full h-10 pl-10 pr-4 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
            />
          </div>
          <button onClick={() => navigate('/officer/projects/new')}
            className="flex items-center gap-2 h-10 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[8px] hover:bg-[#4A56C1] transition-colors flex-shrink-0">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New project
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FilterSelect label="Type" value={filterType} onChange={setFilterType}
            options={[
              { value: 'Road', label: 'Road' }, { value: 'Water', label: 'Water' },
              { value: 'Sewage', label: 'Sewage' }, { value: 'Electrical', label: 'Electrical' },
              { value: 'Parks', label: 'Parks' },
            ]}
          />
          <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
            options={[
              { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
              { value: 'active', label: 'Active' }, { value: 'rejected', label: 'Rejected' },
            ]}
          />
          <FilterSelect label="Timeline" value={filterTime} onChange={setFilterTime}
            options={[
              { value: 'this_month', label: 'Starting this month' },
              { value: 'next_3_months', label: 'Starting next 3 months' },
              { value: 'overdue', label: 'Overdue' },
            ]}
          />
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">{filtered.length} projects</span>
            {hasFilters && <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] font-medium">Clear filters</button>}
          </div>
        </div>
      </div>

      {/* Project list */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No projects found</p>
            <button onClick={() => navigate('/officer/projects/new')}
              className="text-[13px] text-[#5E6AD2] font-medium">Submit a new project →</button>
          </div>
        ) : filtered.map(p => {
          const st = PROJECT_STATUS_CONFIG[p.status] || PROJECT_STATUS_CONFIG.pending
          const scoreColor = p.mcdmScore >= 75 ? '#16A34A' : p.mcdmScore >= 60 ? '#D97706' : '#DC2626'
          return (
            <div key={p.id} onClick={() => navigate(`/officer/projects/${p.id}`)}
              className="flex items-center gap-5 px-5 py-4 bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] cursor-pointer transition-all hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529]"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              {/* Title */}
              <div className="flex-1 min-w-0">
                {p.hasClash && (
                  <div className="flex items-center gap-1 mb-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B91C1C] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#1F0A0A] px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }} />
                      Clash detected
                    </span>
                  </div>
                )}
                <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">{p.title}</p>
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">{p.departmentFull}</p>
              </div>
              {/* Type badge */}
              <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${TYPE_STYLES[p.type] || TYPE_STYLES.Other}`}>{p.type}</span>
              <VDivider />
              {/* Status */}
              <div className="flex-shrink-0 w-[110px] flex justify-center">
                <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${st.bg} ${st.color}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.dot }} />
                  {st.text}
                </span>
              </div>
              <VDivider />
              {/* Timeline + MCDM */}
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Timeline</span>
                  <span className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{formatDate(p.startDate)} – {formatDate(p.endDate)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">MCDM</span>
                  <span className="text-[18px] font-bold leading-none" style={{ color: scoreColor }}>{p.mcdmScore}</span>
                </div>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
    </AsyncState>
  )
}