// Department administration. Reference data for projects, complaints and staff,
// so departments are deactivated rather than deleted — the backend exposes no
// delete, and the reference validators check `isActive` when something new is
// assigned to one.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDepartments, useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import DepartmentFormModal from '../../components/DepartmentFormModal'
import { departmentsApi, normaliseError } from '../../services'
import { useAuth } from '../../hooks/useAuth'
import { formatDateLong } from '../../components/dashboard'

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

const VDivider = () => (
  <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />
)

export default function AdminDepartments() {
  const navigate = useNavigate()
  const { refreshDepartments } = useAuth()
  const { data: fetched, loading, error, reload } = useDepartments()
  // Every screen resolves department references through the AuthContext index,
  // so it has to be re-read whenever this screen changes one.
  const { data: projects } = useProjects()

  // Local copy: the status toggle updates optimistically and reverts on failure,
  // so the list must be mutable independently of the fetch. Re-seeded during
  // render whenever the server list arrives, rather than from an effect.
  const [list,       setList]       = useState([])
  const [seededFrom, setSeededFrom] = useState(null)
  if (fetched && fetched !== seededFrom) {
    setSeededFrom(fetched)
    setList(fetched)
  }

  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [actionError,  setActionError]  = useState('')
  const [pendingId,    setPendingId]    = useState(null)

  const filtered = useMemo(() => {
    return list.filter(d => {
      if (filterStatus === 'active'   && !d.isActive) return false
      if (filterStatus === 'inactive' && d.isActive)  return false
      return true
    })
  }, [list, filterStatus])

  // Projects are the reason a department cannot be deleted, so the count is
  // shown where the decision to deactivate one is made.
  const projectCounts = useMemo(() => {
    const counts = new Map()
    for (const p of projects || []) {
      if (!p.department) continue
      counts.set(p.department, (counts.get(p.department) || 0) + 1)
    }
    return counts
  }, [projects])

  // POST /api/departments, then re-read both this list and the shared index.
  async function handleCreate(payload) {
    await departmentsApi.create(payload)
    reload()
    refreshDepartments()
  }

  // PATCH /api/departments/:id/status
  async function handleToggleStatus(e, id) {
    e.stopPropagation()
    const current = list.find(d => d.id === id)
    if (!current || pendingId) return
    const nextActive = !current.isActive
    setActionError('')
    setPendingId(id)
    setList(prev => prev.map(d => d.id === id ? { ...d, isActive: nextActive } : d))
    try {
      const saved = await departmentsApi.setStatus(id, nextActive)
      setList(prev => prev.map(d => d.id === id ? saved : d))
      refreshDepartments()
    } catch (err) {
      // Revert on failure so the list never diverges from the server.
      setList(prev => prev.map(d => d.id === id ? current : d))
      setActionError(normaliseError(err).message)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading departments...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[
            { value: 'active',   label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
            {filtered.length} {filtered.length === 1 ? 'department' : 'departments'}
          </span>
          {filterStatus && (
            <button onClick={() => setFilterStatus('')} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
              Clear filters
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[8px] hover:bg-[#4A56C1] transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New department
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-[13px] text-[#DC2626] dark:text-[#F87171] flex-shrink-0">{actionError}</p>
      )}

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No departments found</p>
            <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">
              {filterStatus ? 'Try adjusting your filters' : 'Create one to get started'}
            </p>
          </div>
        ) : (
          filtered.map(d => (
            <div
              key={d.id}
              onClick={() => navigate(`/admin/departments/${d.id}`)}
              className={`flex items-center gap-4 px-5 py-4 rounded-[8px] border cursor-pointer transition-all ${
                d.isActive
                  ? 'bg-[#FFFFFF] dark:bg-[#1C1C1F] border-[#E5E5E5] dark:border-[#27272A] hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529]'
                  : 'bg-[#F8FAFC] dark:bg-[#18181B] border-[#E5E5E5] dark:border-[#27272A] opacity-60 hover:opacity-80'
              }`}
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-center gap-3 flex-shrink-0 w-[240px] min-w-0">
                {/* The stored colour is arbitrary, so it is applied inline
                    rather than mapped to a Tailwind class dictionary. */}
                <div className="w-9 h-9 rounded-[8px] flex-shrink-0 border border-[#E5E5E5] dark:border-[#27272A]"
                  style={{ backgroundColor: d.color || '#5E6AD2' }} />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">{d.name}</p>
                  <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate">{d.code}</p>
                </div>
              </div>

              <VDivider />

              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] truncate">{d.description || '—'}</p>
              </div>

              <VDivider />

              <div className="flex-shrink-0 w-[90px] text-center">
                <p className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide mb-0.5">Projects</p>
                <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{projectCounts.get(d.code) || 0}</p>
              </div>

              <VDivider />

              <div className="flex-shrink-0 w-[120px] text-right">
                <p className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide mb-0.5">Created</p>
                <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{formatDateLong(d.createdAt)}</p>
              </div>

              <VDivider />

              <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => handleToggleStatus(e, d.id)}
                  disabled={pendingId !== null}
                  className={`h-8 px-3 text-[12px] font-medium rounded-[6px] border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    d.isActive
                      ? 'text-[#15803D] dark:text-[#4ADE80] border-[#BBF7D0] dark:border-[#166534] bg-[#F0FDF4] dark:bg-[#0D1F14] hover:bg-[#DCFCE7] dark:hover:bg-[#14532D]/30'
                      : 'text-[#6B7280] dark:text-[#9CA3AF] border-[#E2E8F0] dark:border-[#27272A] hover:border-[#5E6AD2]/50'
                  }`}
                >
                  {d.isActive ? '● Active' : '○ Inactive'}
                </button>
              </div>

              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <DepartmentFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
    </AsyncState>
  )
}
