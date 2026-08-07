// Audit trail viewer — administrator only. Read-only by construction: the API
// exposes no way to edit or delete an entry, so this screen has no write path.

import { useState, useMemo } from 'react'
import { useAuditLogs, useUsers, useDepartmentOptions } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { DEPT_STYLES, ROLE_STYLES } from '../../components/uiStyles'
import { auditActionLabel, AUDIT_ACTION_OPTIONS, toCsv, downloadCsv } from '../../components/dashboard'

function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}


function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

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

// Columns for the export, in the order the file should read.
const CSV_COLUMNS = [
  { key: 'userName', header: 'User' },
  { key: 'userRole', header: 'Role' },
  { key: 'department', header: 'Department', value: (l) => l.department || '—' },
  { key: 'action', header: 'Action', value: (l) => auditActionLabel(l.action) },
  { key: 'resourceTitle', header: 'Resource' },
  { key: 'timestamp', header: 'Timestamp', value: (l) => formatDateTime(l.timestamp) },
  { key: 'isOverride', header: 'Override', value: (l) => (l.isOverride ? 'Yes' : 'No') },
]

function exportCSV(data) {
  downloadCsv('civiq_audit_log.csv', toCsv(CSV_COLUMNS, data))
}

const VDivider = () => (
  <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />
)

export default function AdminAudit() {
  const { data: users } = useUsers()
  const departmentOptions = useDepartmentOptions()
  const [filterUser,   setFilterUser]   = useState('')
  const [filterDept,   setFilterDept]   = useState('')
  const [filterAction, setFilterAction] = useState('')

  const auditParams = useMemo(() => ({
    ...(filterUser ? { performedBy: filterUser } : {}),
    ...(filterAction ? { action: filterAction } : {})
  }), [filterUser, filterAction])

  const { data: auditLogs, loading, error, reload } = useAuditLogs(auditParams)

  const filtered = useMemo(() => {
    return [...auditLogs]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .filter(l => {
        if (filterUser   && l.userId !== filterUser)       return false
        if (filterDept   && l.department !== filterDept)   return false
        if (filterAction && l.action !== filterAction)     return false
        return true
      })
  }, [auditLogs, filterUser, filterDept, filterAction])

  const hasFilters = filterUser || filterDept || filterAction

  function clearFilters() {
    setFilterUser('')
    setFilterDept('')
    setFilterAction('')
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading audit log...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        <FilterSelect label="User" value={filterUser} onChange={setFilterUser}
          options={users.map(u => ({ value: u.id, label: u.name }))}
        />
        <FilterSelect label="Department" value={filterDept} onChange={setFilterDept}
          options={departmentOptions}
        />
        <FilterSelect label="Action" value={filterAction} onChange={setFilterAction}
          options={AUDIT_ACTION_OPTIONS}
        />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
          {hasFilters && (
            <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
              Clear filters
            </button>
          )}
          <button
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] rounded-[8px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No audit entries found</p>
            <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          filtered.map(log => (
            <div
              key={log.id}
              className={`flex items-center gap-4 px-5 py-4 rounded-[8px] border transition-all ${
                log.isOverride
                  ? 'bg-[#FFFBEB] dark:bg-[#181305] border-[#FCD34D] dark:border-[#854F0B]'
                  : 'bg-[#FFFFFF] dark:bg-[#1C1C1F] border-[#E5E5E5] dark:border-[#27272A]'
              }`}
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-center gap-3 flex-shrink-0 w-[180px] min-w-0">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border border-[#E0E7FF] dark:border-[#252870]">
                  {getInitials(log.userName)}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">{log.userName}</p>
                  <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ROLE_STYLES[log.userRole] || ROLE_STYLES.admin}`}>
                    {log.userRole}
                  </span>
                </div>
              </div>

              <VDivider />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                    {auditActionLabel(log.action)}
                  </p>
                  {log.isOverride && (
                    <span className="text-[10px] font-bold text-[#D97706] dark:text-[#FACC15] bg-[#FEF3C7] dark:bg-[#422006]/40 px-1.5 py-0.5 rounded flex-shrink-0">
                      OVERRIDE
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate mt-0.5">
                  {log.resourceTitle}
                </p>
              </div>

              <VDivider />

              <div className="flex-shrink-0 w-[80px] flex justify-center">
                {log.department ? (
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${DEPT_STYLES[log.department] || ''}`}>
                    {log.department}
                  </span>
                ) : (
                  <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">Admin</span>
                )}
              </div>

              <VDivider />

              <div className="flex-shrink-0 text-right">
                <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                  {formatDateTime(log.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
    </AsyncState>
  )
}