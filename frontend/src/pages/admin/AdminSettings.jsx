// Administrator profile and notification preferences.
//
// Preference changes are persisted per channel and category and take effect
// immediately for both email and the in-app feed.

import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { inputCls, labelCls } from '../../components/uiStyles'
import { useNotificationCenter } from '../../hooks/useNotificationCenter'
import { usersApi, normaliseError } from '../../services'

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

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Backed by GET/PATCH /api/notifications/preferences. Each row maps to one
// category on both delivery channels, so a toggle here mutes the category
// everywhere rather than only in this screen.
const NOTIFICATION_PREFS = [
  { category: 'project',   label: 'Project updates',   sub: 'Approvals, rejections, assignments and completions' },
  { category: 'conflict',  label: 'Clash detection alerts', sub: 'Raised when a new clash is detected on a project' },
  { category: 'complaint', label: 'Complaint updates', sub: 'Assignments and status changes on citizen complaints' },
]

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-[#5E6AD2]' : 'bg-[#E2E8F0] dark:bg-[#27272A]'}`}
    style={{ minWidth: '40px' }}
  >
    <span
      className="absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200"
      style={{ left: checked ? '19px' : '3px' }}
    />
  </button>
)

export default function AdminSettings() {
  const { user, deptMap, applyUserUpdate } = useAuth()
  const { preferences, savePreferences } = useNotificationCenter()

  const [name,        setName]        = useState(user?.name || '')
  const [nameSaved,   setNameSaved]   = useState(false)
  const [currentPw,   setCurrentPw]   = useState('')
  const [newPw,       setNewPw]       = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [pwError,     setPwError]     = useState('')
  const [pwSuccess,   setPwSuccess]   = useState(false)

  // PUT /api/users/:id — the admin updating their own record. The success
  // indicator now follows the response instead of firing unconditionally.
  const [nameError, setNameError] = useState('')
  async function handleSaveName() {
    if (!name.trim() || !user?.id) return
    setNameError('')
    try {
      // The response is the updated record, already adapted — handing it
      // straight to the session updates the navbar on this render rather than
      // on the next reload, and costs no second request.
      const saved = await usersApi.update(user.id, { fullName: name.trim() }, deptMap)
      applyUserUpdate(saved)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2500)
    } catch (err) {
      // normaliseError, not err.message: an Axios rejection carries only
      // "Request failed with status code 404" there, while the backend's own
      // message sits at err.response.data.message.
      setNameError(normaliseError(err).message || 'Could not save your name.')
    }
  }

  // No password-change endpoint exists on the backend, so this form cannot
  // complete. It reports that plainly rather than showing a success message
  // for something that never happened.
  function handleChangePassword() {
    setPwError('Password changes are not available yet — ask an administrator to reset it for you.')
    setPwSuccess(false)
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Profile ── */}
      <Card>
        <SectionLabel>Profile</SectionLabel>
        <div className="flex items-center gap-5 mb-6 pb-5 border-b border-[#F3F4F6] dark:border-[#27272A]">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-bold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border-2 border-[#E0E7FF] dark:border-[#252870]">
              {getInitials(name)}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#5E6AD2] border-2 border-white dark:border-[#1C1C1F] flex items-center justify-center cursor-pointer">
              <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          </div>
          <div>
            <p className="text-[16px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">{name}</p>
            <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">{user?.roleLabel || '—'}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">{user?.email || '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>Display name</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1.5">This appears in the navbar and audit log</p>
          </div>
          <div>
            <label className={labelCls}>Work email</label>
            <input className={`${inputCls} opacity-60 cursor-not-allowed`} value={user?.email || '—'} readOnly />
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1.5">Email cannot be changed here</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 mt-4">
          <div>
            <label className={labelCls}>Role</label>
            <input className={`${inputCls} opacity-60 cursor-not-allowed`} value={user?.roleLabel || ''} readOnly />
          </div>
          <div>
            <label className={labelCls}>Department</label>
            <input className={`${inputCls} opacity-60 cursor-not-allowed`} value={user?.departmentFull || user?.department || '—'} readOnly />
          </div>
        </div>

        <div className="flex justify-end mt-5">
          {nameError && (
            <span className="text-[13px] text-[#DC2626] mr-4">{nameError}</span>
          )}
          {nameSaved && (
            <span className="text-[13px] text-[#16A34A] dark:text-[#4ADE80] mr-4 flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Changes saved
            </span>
          )}
          <button onClick={handleSaveName}
            className="h-9 px-5 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
            Save changes
          </button>
        </div>
      </Card>

      {/* ── Security ── */}
      <Card>
        <SectionLabel>Security</SectionLabel>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Current password</label>
            <input className={inputCls} type="password" placeholder="••••••••" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>New password</label>
            <input className={inputCls} type="password" placeholder="••••••••" value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Confirm new password</label>
            <input className={inputCls} type="password" placeholder="••••••••" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
          </div>
        </div>
        {pwError && <p className="text-[13px] text-[#DC2626] dark:text-[#F87171] mt-3">{pwError}</p>}
        {pwSuccess && (
          <p className="text-[13px] text-[#16A34A] dark:text-[#4ADE80] mt-3 flex items-center gap-1.5">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Password updated successfully
          </p>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={handleChangePassword}
            className="h-9 px-5 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
            Update password
          </button>
        </div>
      </Card>

      {/* ── Preferences ── */}
      <Card>
        <SectionLabel>Preferences</SectionLabel>
        <div className="flex flex-col gap-4">
          {NOTIFICATION_PREFS.map(pref => (
            <div key={pref.label} className="flex items-center justify-between py-3 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
              <div className="min-w-0 mr-8">
                <p className="text-[14px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">{pref.label}</p>
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">{pref.sub}</p>
              </div>
              <Toggle
                checked={preferences?.inApp?.[pref.category] !== false}
                onChange={(value) => savePreferences({ inApp: { [pref.category]: value }, email: { [pref.category]: value } })}
              />
            </div>
          ))}
        </div>
      </Card>

    </div>
  )
}
