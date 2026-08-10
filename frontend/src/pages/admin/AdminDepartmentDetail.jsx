// Single department: reference details, the projects that depend on it, and its
// activation state.
//
// There is no delete: projects and complaints hold the department id and the
// history must stay readable, so a retired department is deactivated instead.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDepartment, useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import DepartmentFormModal from '../../components/DepartmentFormModal'
import { departmentsApi, normaliseError } from '../../services'
import { useAuth } from '../../hooks/useAuth'
import { PROJECT_STATUS_CONFIG } from '../../components/uiStyles'
import { formatDateLong } from '../../components/dashboard'

function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] p-5 ${className}`}
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">{children}</p>
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
      <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] flex-shrink-0 w-36">{label}</span>
      <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right">{value || '—'}</span>
    </div>
  )
}

export default function AdminDepartmentDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { refreshDepartments } = useAuth()
  const { data: department, loading, error, reload } = useDepartment(id)
  const { data: projects } = useProjects()

  const [showEdit,     setShowEdit]     = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [actionError,  setActionError]  = useState('')
  const [saving,       setSaving]       = useState(false)

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading department..." >{null}</AsyncState>
  }

  if (!department) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] font-medium text-[#6B7280]">Department not found</p>
        <button onClick={() => navigate('/admin/departments')} className="mt-3 text-[13px] text-[#5E6AD2] font-medium">
          ← Back to Departments
        </button>
      </div>
    )
  }

  // Projects carry the department code, not its id, once adapted.
  const departmentProjects = (projects || []).filter(p => p.department === department.code)

  // PUT /api/departments/:id — the modal reports any rejection itself, so the
  // error is left to propagate.
  async function handleEdit(payload) {
    await departmentsApi.update(id, payload)
    reload()
    refreshDepartments()
  }

  // PATCH /api/departments/:id/status
  async function handleToggleStatus(nextActive) {
    if (saving) return
    setActionError('')
    setSaving(true)
    try {
      await departmentsApi.setStatus(id, nextActive)
      reload()
      refreshDepartments()
    } catch (err) {
      setActionError(normaliseError(err).message)
    } finally {
      setSaving(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      <button
        onClick={() => navigate('/admin/departments')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Departments
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-[12px] border-2 border-[#E5E5E5] dark:border-[#27272A] flex-shrink-0"
            style={{ backgroundColor: department.color || '#5E6AD2' }} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">{department.name}</h2>
              <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${
                department.isActive
                  ? 'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]'
                  : 'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]'
              }`}>
                {department.isActive ? '● Active' : '○ Inactive'}
              </span>
            </div>
            <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">{department.code}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowEdit(true)}
            className="h-9 px-4 text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
            Edit
          </button>
          {department.isActive ? (
            <button onClick={() => setShowConfirm(true)} disabled={saving}
              className="h-9 px-4 text-[13px] font-medium text-[#DC2626] border border-[#FECACA] dark:border-[#7F1D1D] rounded-[6px] hover:bg-[#FEF2F2] dark:hover:bg-[#1F0A0A] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              Deactivate
            </button>
          ) : (
            <button onClick={() => handleToggleStatus(true)} disabled={saving}
              className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Activating...' : 'Activate'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="text-[13px] text-[#DC2626] dark:text-[#F87171]">{actionError}</p>
      )}

      {showConfirm && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-[8px] bg-[#FEF2F2] dark:bg-[#1F0A0A] border border-[#FECACA] dark:border-[#7F1D1D]">
          <p className="text-[13px] text-[#B91C1C] dark:text-[#F87171] font-medium">
            Deactivate {department.name}? It can no longer be assigned to new projects or complaints.
            {departmentProjects.length > 0 && ` ${departmentProjects.length} existing ${departmentProjects.length === 1 ? 'project keeps' : 'projects keep'} referencing it.`}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowConfirm(false)} disabled={saving}
              className="px-3 py-1.5 text-[12px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-white dark:hover:bg-[#18181B] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              Cancel
            </button>
            <button onClick={() => handleToggleStatus(false)} disabled={saving}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#DC2626] rounded-[6px] hover:bg-[#B91C1C] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Deactivating...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Department information</SectionLabel>
          <InfoRow label="Name"        value={department.name} />
          <InfoRow label="Code"        value={department.code} />
          <InfoRow label="Description" value={department.description} />
          <InfoRow label="Colour"      value={department.color} />
          <InfoRow label="Created"     value={formatDateLong(department.createdAt)} />
          <InfoRow label="Status"      value={department.isActive ? 'Active' : 'Inactive'} />
        </Card>

        <Card>
          <SectionLabel>Workload</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Projects', value: departmentProjects.length },
              { label: 'Active projects', value: departmentProjects.filter(p => p.status === 'active').length },
            ].map(s => (
              <div key={s.label} className="flex flex-col p-3 rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]">
                <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-2">{s.label}</p>
                <p className="text-[28px] font-bold text-[#0F172A] dark:text-[#F8FAFC] leading-none">{s.value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {departmentProjects.length > 0 && (
        <Card>
          <SectionLabel>Projects in this department</SectionLabel>
          <div className="flex flex-col gap-2">
            {departmentProjects.map(p => {
              const status = PROJECT_STATUS_CONFIG[p.status] || PROJECT_STATUS_CONFIG.pending
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/admin/projects/${p.id}`)}
                  className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] cursor-pointer hover:border-[#5E6AD2]/40 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">{p.title}</p>
                    <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">{p.ward} · {formatDateLong(p.startDate)} – {formatDateLong(p.endDate)}</p>
                  </div>
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${status.bg} ${status.color}`}>
                    {status.text}
                  </span>
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {showEdit && (
        <DepartmentFormModal
          mode="edit"
          department={department}
          onClose={() => setShowEdit(false)}
          onSubmit={handleEdit}
        />
      )}

    </div>
  )
}
