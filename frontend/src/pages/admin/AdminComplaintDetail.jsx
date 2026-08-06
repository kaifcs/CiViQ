// Single complaint: status progression and officer assignment.
//
// Status advances one step at a time through the backend's enum; the screen
// offers only the next valid state rather than a free choice.

import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useComplaint, useUsers, useDepartments } from '../../hooks/useResources'
import { useAuth } from '../../hooks/useAuth'
import { useMutation } from '../../hooks/useApi'
import { complaintsApi } from '../../services'
import AsyncState from '../../components/AsyncState'
import { COMPLAINT_STATUS_CONFIG, DEPT_STYLES, inputCls, labelCls } from '../../components/uiStyles'
import { formatDateLong } from '../../components/dashboard'

// ─── Helpers ───────────────────────────────────
function formatDateTime(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// ─── Status config ─────────────────────────────
// ─── Small components ──────────────────────────
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

// ─── Status Timeline ───────────────────────────
const TIMELINE_STEPS = [
  { key: 'submitted',    label: 'Submitted',    dateKey: 'filedAt' },
  { key: 'acknowledged', label: 'Acknowledged', dateKey: 'acknowledgedAt' },
  { key: 'in_progress',  label: 'In Progress',  dateKey: null },
  { key: 'resolved',     label: 'Resolved',     dateKey: 'resolvedAt' },
]

const STATUS_ORDER = ['submitted', 'acknowledged', 'in_progress', 'resolved']

function StatusTimeline({ complaint }) {
  const currentIdx = STATUS_ORDER.indexOf(complaint.status)

  return (
    <div className="flex items-start gap-0">
      {TIMELINE_STEPS.map((step, i) => {
        const isDone = i <= currentIdx
        const isLast = i === TIMELINE_STEPS.length - 1
        const dateVal = step.dateKey ? complaint[step.dateKey] : null

        return (
          <div key={step.key} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {/* Left line */}
              <div className={`flex-1 h-[2px] ${i === 0 ? 'invisible' : isDone ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />
              {/* Dot */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                isDone
                  ? 'border-[#5E6AD2] bg-[#5E6AD2]'
                  : 'border-[#E5E5E5] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F]'
              }`}>
                {isDone ? (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-[#E5E5E5] dark:bg-[#374151]" />
                )}
              </div>
              {/* Right line */}
              <div className={`flex-1 h-[2px] ${isLast ? 'invisible' : isDone && i < currentIdx ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />
            </div>

            {/* Label + date */}
            <div className="mt-2 text-center px-1">
              <p className={`text-[12px] font-semibold ${isDone ? 'text-[#0F172A] dark:text-[#F8FAFC]' : 'text-[#9CA3AF] dark:text-[#6B7280]'}`}>
                {step.label}
              </p>
              {dateVal ? (
                <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">
                  {formatDateTime(dateVal)}
                </p>
              ) : isDone ? (
                <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">—</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Admin Complaint Detail ────────────────────
export default function AdminComplaintDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { deptMap } = useAuth()
  const { data: complaint, loading, error, reload, setData } = useComplaint(id)
  // Both are admin-only endpoints, and this is an admin-only route.
  const { data: users } = useUsers()
  const { data: departments } = useDepartments()

  const [remindSent,  setRemindSent]  = useState(false)
  const [noteText,    setNoteText]    = useState('')
  const [noteSaved,   setNoteSaved]   = useState(false)
  const [escalated,   setEscalated]   = useState(false)
  const [showNoteBox, setShowNoteBox] = useState(false)

  // Assignment. Re-seeded during render when a different complaint loads, the
  // convention the other detail screens use, rather than from an effect.
  const [officerId,   setOfficerId]   = useState('')
  const [deptId,      setDeptId]      = useState('')
  const [seededFor,   setSeededFor]   = useState(null)
  if (complaint && complaint.id !== seededFor) {
    setSeededFor(complaint.id)
    setOfficerId(complaint.assignedOfficer ? String(complaint.assignedOfficer) : '')
    setDeptId(complaint._raw?.assignedDepartment ? String(complaint._raw.assignedDepartment) : '')
  }

  const assign = useMutation(
    useCallback(
      (payload) => complaintsApi.assign(id, payload, deptMap),
      [id, deptMap]
    )
  )

  const submitAssignment = useCallback(async () => {
    // PATCH /api/complaints/:id/assign — the one writer of these two fields.
    // It answers with the updated complaint, and adaptComplaint reads both from
    // bare ids, so the response can be applied directly.
    const result = await assign.run({
      assignedDepartment: deptId || null,
      assignedOfficer: officerId || null,
    })
    if (result.ok) setData(result.data)
  }, [assign, deptId, officerId, setData])

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading complaint..." >{null}</AsyncState>
  }

  if (!complaint) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] font-medium text-[#6B7280]">Complaint not found</p>
        <button onClick={() => navigate('/admin/complaints')} className="mt-3 text-[13px] text-[#5E6AD2] font-medium">
          ← Back to Complaints
        </button>
      </div>
    )
  }

  const status = COMPLAINT_STATUS_CONFIG[complaint.status] || COMPLAINT_STATUS_CONFIG.submitted

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Back ── */}
      <button
        onClick={() => navigate('/admin/complaints')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Complaints
      </button>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[13px] font-bold text-[#5E6AD2] dark:text-[#818CF8] font-mono">{complaint.cnrId}</span>
            <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${DEPT_STYLES[complaint.department] || DEPT_STYLES.Other}`}>
              {complaint.department}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.dot }} />
              {status.text}
            </span>
            {complaint.overdue && (
              <span className="text-[11px] font-semibold text-[#DC2626] dark:text-[#F87171] bg-[#FEE2E2] dark:bg-[#7F1D1D]/30 px-2 py-0.5 rounded">
                Overdue
              </span>
            )}
          </div>
          <h1 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {complaint.issueType}
          </h1>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{complaint.address}</p>
        </div>

        {/* Admin actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {escalated ? (
            <span className="text-[13px] font-medium text-[#DC2626] dark:text-[#F87171] flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Escalated
            </span>
          ) : (
            <button
              onClick={() => setEscalated(true)}
              className="h-9 px-4 text-[13px] font-medium text-[#DC2626] border border-[#FECACA] dark:border-[#7F1D1D] rounded-[6px] hover:bg-[#FEF2F2] dark:hover:bg-[#1F0A0A] transition-colors"
            >
              Escalate
            </button>
          )}
          <button
            onClick={() => setShowNoteBox(!showNoteBox)}
            className="h-9 px-4 text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors"
          >
            Add note
          </button>
          {remindSent ? (
            <span className="h-9 px-4 text-[13px] font-medium text-[#16A34A] dark:text-[#4ADE80] border border-[#BBF7D0] dark:border-[#166534] rounded-[6px] bg-[#F0FDF4] dark:bg-[#0D1F14] flex items-center">
              ✓ Reminder sent
            </span>
          ) : (
            <button
              onClick={() => setRemindSent(true)}
              disabled={complaint.status === 'resolved'}
              className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send reminder
            </button>
          )}
        </div>
      </div>

      {/* Add note box */}
      {showNoteBox && (
        <Card>
          <SectionLabel>Internal note</SectionLabel>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add an internal note visible only to admins..."
            rows={3}
            className="w-full px-3 py-2.5 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowNoteBox(false)} className="px-4 py-2 text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
              Cancel
            </button>
            <button
              onClick={() => { setNoteSaved(true); setShowNoteBox(false) }}
              disabled={!noteText.trim()}
              className="px-4 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save note
            </button>
          </div>
        </Card>
      )}

      {/* ══ ROW 1: Info + Map ══ */}
      <div className="grid grid-cols-2 gap-4">

        {/* Complaint information */}
        <Card>
          <SectionLabel>Complaint information</SectionLabel>
          <div className="mb-4 pb-4 border-b border-[#F3F4F6] dark:border-[#27272A]">
            <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-1.5">Description</p>
            <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{complaint.description}</p>
          </div>
          <InfoRow label="CNR ID"       value={complaint.cnrId} />
          <InfoRow label="Issue type"   value={complaint.issueType} />
          <InfoRow label="Department"   value={complaint.department} />
          <InfoRow label="Ward"         value={complaint.ward} />
          <InfoRow label="Filed on"     value={formatDateTime(complaint.filedAt)} />
          <InfoRow label="Acknowledged" value={complaint.acknowledgedAt ? formatDateTime(complaint.acknowledgedAt) : 'Not yet'} />
          <InfoRow label="Resolved on"  value={complaint.resolvedAt ? formatDateLong(complaint.resolvedAt) : 'Not yet'} />
          {complaint.resolutionNote && (
            <div className="pt-3 mt-1">
              <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-1.5">Resolution note</p>
              <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{complaint.resolutionNote}</p>
            </div>
          )}
          {noteSaved && noteText && (
            <div className="pt-3 mt-1 border-t border-[#F3F4F6] dark:border-[#27272A]">
              <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-1.5">Internal note</p>
              <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{noteText}</p>
            </div>
          )}
        </Card>

        {/* Map placeholder */}
        <Card className="flex flex-col">
          <SectionLabel>Complaint location</SectionLabel>
          <div
            className="flex-1 rounded-[8px] flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
            style={{ minHeight: '220px' }}
          >
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] mb-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <p className="text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">{complaint.ward}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1 text-center px-6 leading-relaxed">{complaint.address}</p>
            <p className="text-[11px] text-[#D1D5DB] dark:text-[#374151] mt-4">Pin map loads in Phase 3</p>
          </div>
        </Card>

      </div>

      {/* ══ ROW 2: Assignment ══
          PATCH /api/complaints/:id/assign. Both selects are optional and the
          endpoint accepts either or both; clearing one sends null, which is how
          it unassigns. Assigning an officer is what raises the
          `complaint_assigned` notification. */}
      <Card>
        <SectionLabel>Assignment</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className={labelCls}>Department</label>
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              disabled={assign.saving}
              style={{ paddingRight: '32px' }}
              className={`${inputCls} cursor-pointer disabled:opacity-60`}
            >
              <option value="">Unassigned</option>
              {(departments || []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Officer</label>
            <select
              value={officerId}
              onChange={(e) => setOfficerId(e.target.value)}
              disabled={assign.saving}
              style={{ paddingRight: '32px' }}
              className={`${inputCls} cursor-pointer disabled:opacity-60`}
            >
              <option value="">Unassigned</option>
              {(users || [])
                .filter((u) => u.role === 'officer' && u.status === 'active')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.department ? ` — ${u.department}` : ''}
                  </option>
                ))}
            </select>
          </div>

          <button
            onClick={submitAssignment}
            disabled={assign.saving}
            className="h-10 px-5 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[8px] hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {assign.saving ? 'Saving...' : 'Save assignment'}
          </button>
        </div>

        {assign.error && (
          <p className="text-[12px] text-[#DC2626] dark:text-[#F87171] mt-3">{assign.error.message}</p>
        )}
        {!assign.error && !assign.saving && (
          <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-3">
            {complaint.assignedOfficer
              ? `Currently assigned to ${(users || []).find((u) => String(u.id) === String(complaint.assignedOfficer))?.name || 'an officer'}. Assigning a different officer notifies them.`
              : 'Not assigned to an officer yet. Assigning one notifies them.'}
          </p>
        )}
      </Card>

      {/* ══ ROW 3: Status timeline ══ */}
      <Card>
        <SectionLabel>Status timeline</SectionLabel>
        <StatusTimeline complaint={complaint} />
      </Card>

    </div>
  )
}
