// Account administration. Role changes take effect on the user's next request
// because `protect` re-reads the account every time. Accounts are deactivated,
// never deleted, so the history referencing them stays readable.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUsers, useDepartments, useDepartmentOptions } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { authApi, usersApi, normaliseError } from '../../services'
import { useAuth } from '../../hooks/useAuth'
import { DEPT_STYLES, ROLE_STYLES } from '../../components/uiStyles'
import { formatDateLong } from '../../components/dashboard'

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

const VDivider = () => (
  <div className="w-px h-8 bg-[#E5E5E5] dark:bg-[#27272A] flex-shrink-0" />
)

function CreateUserModal({ onClose, onCreate, departments }) {
  const [form, setForm] = useState({
    name: '', email: '', role: 'officer',
    department: '', password: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Creates the account for real through POST /api/auth/register — an
  // admin-only endpoint, which this screen already satisfies.
  async function handleSubmit() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('All fields are required.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onCreate({
        fullName: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        department: form.department || undefined,
      })
      onClose()
    } catch (err) {
      setError(normaliseError(err).message || 'Could not create the user.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full h-10 px-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
  const labelCls = "block text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1.5"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[12px] p-6 w-full max-w-md mx-4"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">Create new user</h3>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Full name</label>
            <input className={inputCls} placeholder="e.g. Sanjay Tiwari" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Work email</label>
            <input className={inputCls} type="email" placeholder="e.g. sanjay@civiq.in" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ paddingRight: '32px' }}
                className={`${inputCls} cursor-pointer`}>
                <option value="officer">Officer</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                style={{ paddingRight: '32px' }}
                className={`${inputCls} cursor-pointer`}>
                <option value="">No department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Temporary password</label>
            <input className={inputCls} type="password" placeholder="Min 8 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          {error && <p className="text-[13px] text-[#DC2626] dark:text-[#F87171]">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Creating...' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsers() {
  const navigate = useNavigate()

  const { deptMap } = useAuth()
  const { data: fetchedUsers, loading, error, reload } = useUsers()
  const { data: departments } = useDepartments()
  const departmentOptions = useDepartmentOptions()
  // Local copy: the status toggle updates optimistically and reverts on failure,
  // so the list must be mutable independently of the fetch. Re-seeded during
  // render whenever the server list arrives, rather than from an effect.
  const [userList,     setUserList]     = useState([])
  const [seededFrom,   setSeededFrom]   = useState(null)
  if (fetchedUsers && fetchedUsers !== seededFrom) {
    setSeededFrom(fetchedUsers)
    setUserList(fetchedUsers)
  }
  const [filterDept,   setFilterDept]   = useState('')
  const [filterRole,   setFilterRole]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [actionError,  setActionError]  = useState('')
  const [pendingId,    setPendingId]    = useState(null)

  const filtered = useMemo(() => {
    return userList.filter(u => {
      if (filterDept   && u.department !== filterDept)   return false
      if (filterRole   && u.role !== filterRole)         return false
      if (filterStatus && u.status !== filterStatus)     return false
      return true
    })
  }, [userList, filterDept, filterRole, filterStatus])

  const hasFilters = filterDept || filterRole || filterStatus

  function clearFilters() { setFilterDept(''); setFilterRole(''); setFilterStatus('') }

  // POST /api/auth/register creates the account; an optional department is
  // applied with the existing PUT /api/users/:id. The list is then re-read so
  // every row shown comes from MongoDB rather than from local state.
  async function handleCreate(payload) {
    const { department, ...registration } = payload
    const created = await authApi.register(registration)
    try {
      if (department && created?._id) {
        await usersApi.update(created._id, { department }, deptMap)
      }
    } finally {
      reload()
    }
  }

  // Persists to PATCH /api/users/:id/status, then reflects the server result.
  // A rejection — self-deactivation, or removing the last active administrator —
  // reverts the row and surfaces the backend's own message, so the list always
  // shows what the database holds and says why.
  async function handleToggleStatus(e, id) {
    e.stopPropagation()
    const current = userList.find(u => u.id === id)
    if (!current || pendingId) return
    const nextActive = current.status !== 'active'
    setActionError('')
    setPendingId(id)
    setUserList(prev => prev.map(u => u.id === id ? { ...u, status: nextActive ? 'active' : 'inactive' } : u))
    try {
      const saved = await usersApi.setStatus(id, nextActive, deptMap)
      setUserList(prev => prev.map(u => u.id === id ? saved : u))
    } catch (err) {
      // Revert on failure so the UI never diverges from the server.
      setUserList(prev => prev.map(u => u.id === id ? current : u))
      setActionError(normaliseError(err).message)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading users...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        <FilterSelect label="Department" value={filterDept} onChange={setFilterDept}
          options={departmentOptions}
        />
        <FilterSelect label="Role" value={filterRole} onChange={setFilterRole}
          options={[
            { value: 'admin',      label: 'Admin' },
            { value: 'officer',    label: 'Officer' },
            { value: 'supervisor', label: 'Supervisor' },
          ]}
        />
        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[
            { value: 'active',   label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
            {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
          </span>
          {hasFilters && (
            <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
              Clear filters
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[8px] hover:bg-[#4A56C1] transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New user
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-[13px] text-[#DC2626] dark:text-[#F87171] flex-shrink-0">{actionError}</p>
      )}

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[15px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">No users found</p>
            <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          filtered.map(u => (
            <div
              key={u.id}
              onClick={() => navigate(`/admin/users/${u.id}`)}
              className={`flex items-center gap-4 px-5 py-4 rounded-[8px] border cursor-pointer transition-all ${
                u.status === 'inactive'
                  ? 'bg-[#F8FAFC] dark:bg-[#18181B] border-[#E5E5E5] dark:border-[#27272A] opacity-60 hover:opacity-80'
                  : 'bg-[#FFFFFF] dark:bg-[#1C1C1F] border-[#E5E5E5] dark:border-[#27272A] hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA] dark:hover:bg-[#252529]'
              }`}
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-center gap-3 flex-shrink-0 w-[200px] min-w-0">
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-semibold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border border-[#E0E7FF] dark:border-[#252870]">
                  {getInitials(u.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">{u.name}</p>
                  <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] truncate">{u.roleLabel}</p>
                </div>
              </div>

              <VDivider />

              <div className="flex-shrink-0 w-[100px] flex justify-center">
                <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${ROLE_STYLES[u.role] || ROLE_STYLES.officer}`}>
                  {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                </span>
              </div>

              <VDivider />

              <div className="flex-shrink-0 w-[80px] flex justify-center">
                {u.department ? (
                  <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${DEPT_STYLES[u.department] || ''}`}>
                    {u.department}
                  </span>
                ) : (
                  <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">—</span>
                )}
              </div>

              <VDivider />

              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] truncate">{u.email}</p>
              </div>

              <VDivider />

              <div className="flex-shrink-0 w-[120px] text-right">
                <p className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide mb-0.5">Last active</p>
                <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{formatDateLong(u.lastActive)}</p>
              </div>

              <VDivider />

              <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => handleToggleStatus(e, u.id)}
                  disabled={pendingId !== null}
                  className={`h-8 px-3 text-[12px] font-medium rounded-[6px] border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    u.status === 'active'
                      ? 'text-[#15803D] dark:text-[#4ADE80] border-[#BBF7D0] dark:border-[#166534] bg-[#F0FDF4] dark:bg-[#0D1F14] hover:bg-[#DCFCE7] dark:hover:bg-[#14532D]/30'
                      : 'text-[#6B7280] dark:text-[#9CA3AF] border-[#E2E8F0] dark:border-[#27272A] hover:border-[#5E6AD2]/50'
                  }`}
                >
                  {u.status === 'active' ? '● Active' : '○ Inactive'}
                </button>
              </div>

              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <CreateUserModal onClose={() => setShowModal(false)} onCreate={handleCreate} departments={departments} />
      )}
    </div>
    </AsyncState>
  )
}