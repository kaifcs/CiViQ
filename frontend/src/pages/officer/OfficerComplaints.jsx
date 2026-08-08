// Complaints assigned to this officer, with single-step status progression.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useComplaintsPaged } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { complaintsApi } from '../../services'
import { COMPLAINT_STATUS_CONFIG } from '../../components/uiStyles'
import { formatDateLong, daysSince, Pagination } from '../../components/dashboard'

const PAGE_SIZE = 25


const NEXT_STATUS = { submitted: 'acknowledged', acknowledged: 'in_progress', in_progress: 'resolved' }

const VDivider = () => <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ minWidth: '150px', paddingRight: '32px' }}
      className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer">
      <option value="">{label}: All</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function OfficerComplaints() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [statuses, setStatuses] = useState({}) // reflects server-confirmed status

  // A changed filter invalidates the page number — page 4 of the old result set
  // is meaningless in the new one — so the reset happens where the filter
  // changes. Paging never touches the filter.
  function changeStatusFilter(value) {
    setFilterStatus(value)
    setPage(1)
  }

  // Scoped by assignedOfficer on the server, and paged there too — the
  // unpaginated read is capped at 200 records.
  const myParams = useMemo(() => ({
    assignedOfficer: user.id,
    page,
    limit: PAGE_SIZE,
    ...(filterStatus ? { status: filterStatus } : {}),
  }), [user.id, page, filterStatus])

  const { data, loading, error, reload } = useComplaintsPaged(myParams)
  const pagination = data?.pagination || null

  // An optimistic status change can move a row out of the active status filter.
  // It is left in place until the next fetch rather than vanishing mid-update.
  const filtered = data?.items || []

  const hasFilters = filterStatus
  function clearFilters() { changeStatusFilter('') }

  // PATCH /api/complaints/:id/status
  async function handleUpdateStatus(e, id, currentStatus) {
    e.stopPropagation()
    const next = NEXT_STATUS[currentStatus]
    if (!next) return
    setStatuses(prev => ({ ...prev, [id]: next }))
    try {
      const saved = await complaintsApi.setStatus(id, next)
      setStatuses(prev => ({ ...prev, [id]: saved.status }))
    } catch {
      setStatuses(prev => ({ ...prev, [id]: currentStatus }))
    }
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading complaints...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        <FilterSelect label="Status" value={filterStatus} onChange={changeStatusFilter}
          options={[
            { value: 'submitted', label: 'Submitted' }, { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' },
          ]}
        />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
            {pagination ? pagination.total : filtered.length} complaints
          </span>
          {hasFilters && <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] font-medium">Clear filters</button>}
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mb-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No complaints found</p>
          </div>
        ) : filtered.map(c => {
          const currentStatus = statuses[c.id] || c.status
          const st = COMPLAINT_STATUS_CONFIG[currentStatus] || COMPLAINT_STATUS_CONFIG.submitted
          const days = daysSince(c.filedAt)
          const nextSt = NEXT_STATUS[currentStatus]
          return (
            <div key={c.id} onClick={() => navigate(`/officer/complaints/${c.id}`)}
              className="flex items-center gap-4 px-5 py-4 rounded-[8px] border cursor-pointer transition-all bg-[#FFFFFF] dark:bg-[#1C1C1F] border-[#E5E5E5] dark:border-[#27272A] hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529]"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

              <div className="flex-shrink-0 w-[108px]">
                <span className="text-[12px] font-bold text-[#5E6AD2] dark:text-[#818CF8] font-mono">{c.cnrId}</span>
              </div>
              <VDivider />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{c.issueType}</p>
                </div>
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate mt-0.5">{c.address}</p>
              </div>
              <VDivider />

              <div className="flex-shrink-0 w-[80px] flex flex-col items-end gap-0.5">
                <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Filed</span>
                <span className="text-[14px] font-bold leading-none text-[#0F172A] dark:text-[#F8FAFC]">{days}d</span>
                <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">{formatDateLong(c.filedAt)}</span>
              </div>
              <VDivider />

              <div className="flex-shrink-0 w-[130px] flex justify-center">
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.dot }} />{st.text}
                </span>
              </div>
              <VDivider />

              <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                {nextSt ? (
                  <button onClick={e => handleUpdateStatus(e, c.id, currentStatus)}
                    className="h-8 px-3 text-[12px] font-medium text-[#5E6AD2] dark:text-[#818CF8] border border-[#C7D2FE] dark:border-[#252870] bg-[#EEF2FF] dark:bg-[#131629] rounded-[6px] hover:bg-[#E0E7FF] dark:hover:bg-[#1E2260] transition-colors whitespace-nowrap">
                    Mark {COMPLAINT_STATUS_CONFIG[nextSt]?.text}
                  </button>
                ) : (
                  <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">Completed</span>
                )}
              </div>

              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          )
        })}
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