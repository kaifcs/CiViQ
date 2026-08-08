// Complaint queue shared across all staff roles.
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComplaintsPaged, useDashboardComplaints, useDepartmentOptions } from '../../hooks/useResources'
import { useAuth } from '../../hooks/useAuth'
import AsyncState from '../../components/AsyncState'
import { COMPLAINT_STATUS_CONFIG, deptStyle } from '../../components/uiStyles'
import { formatDateLong, daysSince, monthKey, Pagination } from '../../components/dashboard'

// Server-paged queue; filters run on the backend.
const PAGE_SIZE = 25

// Debounce search to avoid a request per keystroke.
const SEARCH_DEBOUNCE_MS = 300

// Label for the current reporting month.
const currentMonthLabel = () =>
  new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ minWidth: '150px', paddingRight: '32px' }}
      className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

const SearchIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

const VDivider = () => (
  <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />
)

export default function AdminComplaints() {
  const navigate = useNavigate()
  const { deptMap } = useAuth()

  // Dashboard metrics come from the analytics endpoint.
  const { data: stats, loading: loadingStats, error: statsError } = useDashboardComplaints()
  const departmentOptions = useDepartmentOptions()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)

  // Reset to the first page when filters change.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  function changeDept(value) {
    setFilterDept(value)
    setPage(1)
  }

  function changeStatus(value) {
    setFilterStatus(value)
    setPage(1)
  }

  // Resolve department codes to IDs for the backend filter.
  const deptIdByCode = useMemo(() => {
    const map = new Map()
    for (const d of deptMap?.values() || []) {
      if (d?.code) map.set(d.code, String(d._id))
    }
    return map
  }, [deptMap])

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterDept && deptIdByCode.has(filterDept)
      ? { department: deptIdByCode.get(filterDept) }
      : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [page, filterStatus, filterDept, debouncedSearch, deptIdByCode])

  const { data, loading, error, reload } = useComplaintsPaged(params)
  const complaints = data?.items || []
  const pagination = data?.pagination || null

  // Read the current month's resolved count from the backend.
  const resolvedThisMonth = useMemo(() => {
    const key = monthKey(new Date())
    return (stats?.resolvedMonthly || []).find(m => m.period === key)?.count ?? 0
  }, [stats])

  // Show unknown when statistics could not be loaded.
  const statValue = (value) => (statsError ? '—' : loadingStats ? '…' : value ?? 0)

  // Backend applies all filters; render the returned page as-is.
  const filtered = complaints

  const hasFilters = search || filterDept || filterStatus

  function clearFilters() {
    setSearch('')
    changeDept('')
    changeStatus('')
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading complaints...">
      <div className="flex flex-col gap-5 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

        {/* Dashboard metrics come from the analytics endpoint. */}
        <div className="flex gap-3 flex-shrink-0">
          {[
            { label: 'Total', sub: 'All time', value: statValue(stats?.total), danger: false },
            { label: 'Unresolved', sub: 'Needs action', value: statValue(stats?.open), danger: true },
            { label: 'Resolved this month', sub: currentMonthLabel(), value: statValue(resolvedThisMonth), danger: false },
          ].map(s => (
            <div
              key={s.label}
              className="flex flex-col rounded-[8px] p-5 bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
              style={{ borderTopWidth: '2px', borderTopColor: '#5E6AD2', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', minWidth: '160px' }}
            >
              <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">{s.label}</p>
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
              placeholder="Search by CNR ID, issue type or address..."
              className="w-full h-10 pl-10 pr-4 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <FilterSelect
              label="Department"
              value={filterDept}
              onChange={changeDept}
              options={departmentOptions}
            />
            <FilterSelect
              label="Status"
              value={filterStatus}
              onChange={changeStatus}
              options={[
                { value: 'submitted', label: 'Submitted' },
                { value: 'acknowledged', label: 'Acknowledged' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'resolved', label: 'Resolved' },
              ]}
            />
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
                {pagination
                  ? `${pagination.total} ${pagination.total === 1 ? 'complaint' : 'complaints'}`
                  : `${filtered.length} ${filtered.length === 1 ? 'complaint' : 'complaints'}`}
              </span>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors"
                >
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No complaints found</p>
              <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            filtered.map(c => {
              const status = COMPLAINT_STATUS_CONFIG[c.status] || COMPLAINT_STATUS_CONFIG.submitted
              const days = daysSince(c.filedAt)

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/admin/complaints/${c.id}`)}
                  className="flex items-center gap-4 px-5 py-4 rounded-[8px] cursor-pointer transition-all border bg-[#FFFFFF] dark:bg-[#1C1C1F] border-[#E5E5E5] dark:border-[#27272A] hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529]"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex-shrink-0 w-[108px]">
                    <span className="text-[12px] font-bold text-[#5E6AD2] dark:text-[#818CF8] font-mono">
                      {c.cnrId}
                    </span>
                  </div>

                  <VDivider />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                        {c.issueType}
                      </p>
                    </div>
                    <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate mt-0.5">
                      {c.address}
                    </p>
                  </div>

                  <VDivider />

                  <div className="flex-shrink-0 w-[80px] flex justify-center">
                    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${deptStyle(c.department)}`}>
                      {c.department}
                    </span>
                  </div>

                  <VDivider />

                  <div className="flex-shrink-0 w-[80px] flex flex-col items-end gap-0.5">
                    <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Filed</span>
                    <span className="text-[14px] font-bold leading-none text-[#0F172A] dark:text-[#F8FAFC]">
                      {days}d
                    </span>
                    <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">
                      {formatDateLong(c.filedAt)}
                    </span>
                  </div>

                  <VDivider />

                  <div className="flex-shrink-0 w-[130px] flex justify-center">
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: status.dot }}
                      />
                      {status.text}
                    </span>
                  </div>

                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    viewBox="0 0 24 24"
                    className="text-[#D1D5DB] dark:text-[#374151] flex-shrink-0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              )
            })
          )}
        </div>

        <Pagination
          pagination={pagination}
          page={page}
          onPageChange={setPage}
          label="complaints"
        />

      </div>
    </AsyncState>
  )
}