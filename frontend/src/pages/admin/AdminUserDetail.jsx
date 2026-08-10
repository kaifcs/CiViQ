// Single account: profile, role and activation state.
//
// Both a role change and a deactivation notify the affected user.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser, useProjects, useAuditLogs } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { usersApi, normaliseError, ROLES, roleLabel } from '../../services'
import { useAuth } from '../../hooks/useAuth'
import { ROLE_STYLES } from '../../components/uiStyles'
import { formatDateLong, auditActionLabel } from '../../components/dashboard'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}


const STATUS_STYLES = {
  pending:  'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]',
  approved: 'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  active:   'bg-[#EEF2FF] text-[#4338CA] dark:bg-[#131629] dark:text-[#818CF8]',
  rejected: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#1F0A0A] dark:text-[#F87171]',
}

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

export default function AdminUserDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { deptMap } = useAuth()
  const { data: user, loading, error, reload } = useUser(id)
  const { data: projects } = useProjects()
  const { data: auditLogs } = useAuditLogs()

  // `user` is null on the first render, so seeding once would report a
  // deactivated account as Active and keep the Deactivate action live.
  const [userStatus,   setUserStatus]   = useState('active')
  const [seededFor,    setSeededFor]    = useState(null)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [actionDone,   setActionDone]   = useState(null)
  const [actionError,  setActionError]  = useState('')
  const [deactivating, setDeactivating] = useState(false)

  // Role is held separately from `user` so the card reflects a saved change
  // without a refetch, and reverts cleanly when the backend refuses one.
  const [currentRole, setCurrentRole] = useState('officer')
  const [roleDraft,   setRoleDraft]   = useState('officer')
  const [savingRole,  setSavingRole]  = useState(false)
  const [roleSaved,   setRoleSaved]   = useState(false)
  const [roleError,   setRoleError]   = useState('')

  if (user && user.id !== seededFor) {
    setSeededFor(user.id)
    setUserStatus(user.status)
    setCurrentRole(user.role)
    setRoleDraft(user.role)
    setRoleSaved(false)
    setRoleError('')
    setActionDone(null)
    setActionError('')
  }

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading user..." >{null}</AsyncState>
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] font-medium text-[#6B7280]">User not found</p>
        <button onClick={() => navigate('/admin/users')} className="mt-3 text-[13px] text-[#5E6AD2] font-medium">
          ← Back to Users
        </button>
      </div>
    )
  }

  const userProjects = currentRole === 'officer'
    ? projects.filter(p => p.officerId === user.id)
    : currentRole === 'supervisor'
      ? projects.filter(p => p.supervisorId === user.id)
      : []

  const userAudit = auditLogs
    .filter(a => a.userId === user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5)

  // Matches the backend definition of a completed project.
  const completedProjects = userProjects.filter(p => p.status === 'completed').length
  const completionRate = userProjects.length > 0
    ? Math.round((completedProjects / userProjects.length) * 100)
    : 0

  // PUT /api/users/:id — the same admin-only endpoint that owns every other
  // profile field. The backend is the authority on whether the change is
  // allowed: it refuses an administrator demoting themselves and refuses any
  // change that would leave no active administrator, so those messages are
  // surfaced verbatim rather than being re-derived here.
  async function handleRoleSave() {
    if (savingRole || roleDraft === currentRole) return
    setRoleError('')
    setRoleSaved(false)
    setSavingRole(true)
    try {
      const saved = await usersApi.update(id, { role: roleDraft }, deptMap)
      setCurrentRole(saved.role)
      setRoleDraft(saved.role)
      setRoleSaved(true)
    } catch (err) {
      setRoleError(normaliseError(err).message)
      setRoleDraft(currentRole)
    } finally {
      setSavingRole(false)
    }
  }

  // Keep the current status if the backend rejects the update.
  async function handleDeactivate() {
    if (deactivating) return
    setActionError('')
    setDeactivating(true)
    try {
      const saved = await usersApi.setStatus(id, false, deptMap)
      setUserStatus(saved.status)
      setActionDone('deactivated')
    } catch (err) {
      setActionError(normaliseError(err).message)
    } finally {
      setDeactivating(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      <button
        onClick={() => navigate('/admin/users')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Users
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-bold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border-2 border-[#E0E7FF] dark:border-[#252870]">
            {getInitials(user.name)}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">{user.name}</h2>
              <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${ROLE_STYLES[currentRole] || ROLE_STYLES.officer}`}>
                {currentRole.charAt(0).toUpperCase() + currentRole.slice(1)}
              </span>
              <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${
                userStatus === 'active'
                  ? 'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]'
                  : 'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]'
              }`}>
                {userStatus === 'active' ? '● Active' : '○ Inactive'}
              </span>
            </div>
            <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {actionDone === 'deactivated' && (
            <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Account deactivated</span>
          )}
          {/* The backend exposes no password-reset endpoint, so this control
              reports that rather than confirming a message it never sent. */}
          <button
            type="button"
            disabled
            title="Password reset is not available yet — no endpoint exists for it."
            className="h-9 px-4 text-[13px] font-medium text-[#9CA3AF] dark:text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] opacity-60 cursor-not-allowed transition-colors">
            Reset password
          </button>
          {!actionDone && userStatus === 'active' && (
            <button onClick={() => setShowConfirm(true)}
              className="h-9 px-4 text-[13px] font-medium text-[#DC2626] border border-[#FECACA] dark:border-[#7F1D1D] rounded-[6px] hover:bg-[#FEF2F2] dark:hover:bg-[#1F0A0A] transition-colors">
              Deactivate
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
            Deactivate {user.name}? They will lose access immediately.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowConfirm(false)} disabled={deactivating} className="px-3 py-1.5 text-[12px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-white dark:hover:bg-[#18181B] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">Cancel</button>
            <button onClick={handleDeactivate} disabled={deactivating} className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#DC2626] rounded-[6px] hover:bg-[#B91C1C] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {deactivating ? 'Deactivating...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Profile information</SectionLabel>
          <InfoRow label="Full name"    value={user.name} />
          <InfoRow label="Email"        value={user.email} />
          <InfoRow label="Role"         value={roleLabel(currentRole)} />
          <InfoRow label="Department"   value={user.departmentFull || '—'} />
          <InfoRow label="Account created" value={formatDateLong(user.createdAt)} />
          <InfoRow label="Last active"  value={formatDateLong(user.lastActive)} />
          <InfoRow label="Status"       value={userStatus === 'active' ? 'Active' : 'Inactive'} />

          <div className="mt-5 pt-5 border-t border-[#F3F4F6] dark:border-[#27272A]">
            <label htmlFor="user-role" className="block text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1.5">
              Change role
            </label>
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mb-2.5">
              Takes effect on this account&rsquo;s next request. The change is recorded in the
              audit trail and the account is notified.
            </p>
            <div className="flex items-center gap-2">
              <select
                id="user-role"
                value={roleDraft}
                onChange={e => { setRoleDraft(e.target.value); setRoleSaved(false); setRoleError('') }}
                disabled={savingRole}
                className="h-9 px-3 text-[13px] rounded-[6px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 disabled:opacity-60 transition-all"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRoleSave}
                disabled={savingRole || roleDraft === currentRole}
                className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingRole ? 'Saving...' : 'Save role'}
              </button>
            </div>
            {roleError && (
              <p role="alert" className="text-[12px] text-[#DC2626] dark:text-[#F87171] mt-2">{roleError}</p>
            )}
            {roleSaved && !roleError && (
              <p className="text-[12px] text-[#15803D] dark:text-[#4ADE80] mt-2">Role updated.</p>
            )}
          </div>
        </Card>

        <Card>
          <SectionLabel>Activity summary</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mb-5">
            {[
              { label: currentRole === 'supervisor' ? 'Tasks assigned' : 'Projects submitted', value: userProjects.length },
              { label: 'Completion rate', value: `${completionRate}%` },
            ].map(s => (
              <div key={s.label} className="flex flex-col p-3 rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]">
                <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-2">{s.label}</p>
                <p className="text-[28px] font-bold text-[#0F172A] dark:text-[#F8FAFC] leading-none">{s.value}</p>
              </div>
            ))}
          </div>

          {userAudit.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">Recent actions</p>
              <div className="flex flex-col">
                {userAudit.map((a, i) => (
                  <div key={a.id} className={`flex items-start gap-3 py-2.5 ${i < userAudit.length - 1 ? 'border-b border-[#F3F4F6] dark:border-[#27272A]' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{auditActionLabel(a.action)}</p>
                      <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] truncate mt-0.5">{a.resourceTitle}</p>
                    </div>
                    <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] flex-shrink-0">
                      {formatDateLong(a.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {userProjects.length > 0 && (
        <Card>
          <SectionLabel>Projects involved</SectionLabel>
          <div className="flex flex-col gap-2">
            {userProjects.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/admin/projects/${p.id}`)}
                className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] cursor-pointer hover:border-[#5E6AD2]/40 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">{p.title}</p>
                  <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">{p.ward} · {formatDateLong(p.startDate)} – {formatDateLong(p.endDate)}</p>
                </div>
                <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[p.status] || STATUS_STYLES.pending}`}>
                  {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                </span>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  )
}