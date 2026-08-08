// Officer's conflict queue, already scoped by the backend to conflicts touching
// this officer's projects. An opposing project they cannot see arrives as a bare
// id and renders as "details unavailable", so the row is never hidden.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useConflicts } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { CONFLICT_STATUS_CONFIG, deptStyle, SEVERITY_CONFIG, scoreColor } from '../../components/uiStyles'
import { daysSince } from '../../components/dashboard'


function FilterSelect({ label, value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ minWidth: '150px', paddingRight: '32px' }}
      className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer">
      <option value="">{label}: All</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function OfficerConflicts() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // No fallback: defaulting to PWD would present another department's clashes
  // as this officer's.
  const dept = user?.department || null
  const { data: conflicts, loading, error, reload } = useConflicts()

  const [filterStatus, setFilterStatus] = useState('')

  // The `dept &&` guard matters: a redacted side adapts to a null dept, so an
  // unset `dept` would otherwise match every conflict the viewer cannot see.
  const myConflicts = (conflicts || []).filter(
    c => dept && (c.projectADept === dept || c.projectBDept === dept)
  )
  const filtered    = useMemo(() => myConflicts.filter(c => !filterStatus || c.status === filterStatus), [myConflicts, filterStatus])

  const unresolvedCount      = myConflicts.filter(c => c.status === 'unresolved').length
  const pendingResponseCount = myConflicts.filter(c => c.status === 'pending_response').length
  const resolvedCount        = myConflicts.filter(c => c.status === 'resolved').length

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading conflicts...">
    <div className="flex flex-col gap-5 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex gap-3 flex-shrink-0">
        {[
          { label: 'Unresolved',       sub: 'Needs action',    value: unresolvedCount,      danger: true  },
          { label: 'Pending Response', sub: 'Awaiting officer', value: pendingResponseCount, danger: false },
          { label: 'Resolved',         sub: 'Completed',        value: resolvedCount,        danger: false },
        ].map(s => (
          <div key={s.label} className="flex flex-col rounded-[8px] p-5 bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
            style={{ borderTopWidth: '2px', borderTopColor: '#5E6AD2', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', minWidth: '180px' }}>
            <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">{s.label}</p>
            <p className={`text-[36px] font-bold leading-none mb-1 ${s.danger && s.value > 0 ? 'text-[#DC2626] dark:text-[#FCA5A5]' : 'text-[#0F172A] dark:text-[#F8FAFC]'}`}>{s.value}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] border border-[#C7D2FE] dark:border-[#252870] flex-shrink-0">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p className="text-[13px] text-[#4338CA] dark:text-[#818CF8]">{dept
          ? <>Showing clashes involving <span className="font-semibold">{dept}</span> department projects. View only — clash resolution is handled by the Admin.</>
          : 'Your account has no department assigned, so no departmental clashes can be listed. Contact an administrator.'}</p>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[
            { value: 'unresolved', label: 'Unresolved' },
            { value: 'pending_response', label: 'Pending Response' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
        <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] ml-auto">{filtered.length} {filtered.length === 1 ? 'conflict' : 'conflicts'}</span>
        {filterStatus && <button onClick={() => setFilterStatus('')} className="text-[13px] text-[#5E6AD2] font-medium">Clear</button>}
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <p className="text-[15px] font-medium text-[#16A34A] dark:text-[#4ADE80]">No clashes found</p>
          </div>
        ) : filtered.map(c => {
          const days = daysSince(c.detectedAt)
          const st = CONFLICT_STATUS_CONFIG[c.status] || CONFLICT_STATUS_CONFIG.unresolved
          const sv = SEVERITY_CONFIG[c.severity] || SEVERITY_CONFIG.low
          return (
            <div key={c.id} onClick={() => navigate(`/officer/conflicts/${c.id}`)}
              className="px-5 py-4 bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] cursor-pointer transition-all hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529] flex flex-col gap-3"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">{c.projectATitle}</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${deptStyle(c.projectADept)}`}>{c.projectADept}</span>
                    <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">MCDM</span>
                    <span className="text-[14px] font-bold" style={{ color: scoreColor(c.projectAScore) }}>{c.projectAScore}</span>
                  </div>
                </div>
                <div className="flex items-center pt-1 flex-shrink-0">
                  <span className="text-[11px] font-bold text-[#9CA3AF] dark:text-[#6B7280] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] px-2.5 py-1 rounded-full">VS</span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5 items-end">
                  <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug text-right">{c.projectBTitle}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">MCDM</span>
                    <span className="text-[14px] font-bold" style={{ color: scoreColor(c.projectBScore) }}>{c.projectBScore}</span>
                    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${deptStyle(c.projectBDept)}`}>{c.projectBDept}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-[#F3F4F6] dark:border-[#27272A]" />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" className="text-[#9CA3AF] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate">{c.overlapDescription}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${sv.bg} ${sv.color}`}>{sv.text}</span>
                  <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.dot }} />{st.text}
                  </span>
                  <div className="w-px h-4 bg-[#E5E5E5] dark:bg-[#27272A]" />
                  <span className="text-[12px] font-medium text-[#9CA3AF] dark:text-[#6B7280]">{days}d ago</span>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
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