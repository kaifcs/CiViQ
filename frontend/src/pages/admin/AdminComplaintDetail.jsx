// Single complaint: status progression and officer assignment. Status advances
// one step at a time through the backend's enum, so the screen offers only the
// next valid state rather than a free choice.

import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useComplaint, useUsers, useDepartments } from '../../hooks/useResources'
import { useAuth } from '../../hooks/useAuth'
import { useMutation } from '../../hooks/useApi'
import { complaintsApi } from '../../services'
import AsyncState from '../../components/AsyncState'
import { COMPLAINT_STATUS_CONFIG, deptStyle, inputCls, labelCls } from '../../components/uiStyles'
import { formatDateLong } from '../../components/dashboard'
import { LocationMap } from '../../gis'

function formatDateTime(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
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

const TIMELINE_STEPS = [
  { key: 'submitted',    label: 'Submitted',    dateKey: 'filedAt' },
  { key: 'acknowledged', label: 'Acknowledged', dateKey: 'acknowledgedAt' },
  { key: 'in_progress',  label: 'In Progress',  dateKey: null },
  { key: 'resolved',     label: 'Resolved',     dateKey: 'resolvedAt' },
]

const STATUS_ORDER = ['submitted', 'acknowledged', 'in_progress', 'resolved']

// The workflow advances one step at a time, so the screen offers only the next
// valid state rather than a free choice the backend enum would refuse.
const NEXT_STATUS = { submitted: 'acknowledged', acknowledged: 'in_progress', in_progress: 'resolved' }

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
              <div className={`flex-1 h-[2px] ${i === 0 ? 'invisible' : isDone ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />
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
              <div className={`flex-1 h-[2px] ${isLast ? 'invisible' : isDone && i < currentIdx ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />
            </div>

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

export default function AdminComplaintDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { deptMap } = useAuth()
  const { data: complaint, loading, error, reload, setData } = useComplaint(id)
  // Both are admin-only endpoints, and this is an admin-only route.
  const { data: users } = useUsers()
  const { data: departments } = useDepartments()

  const [showNoteInput, setShowNoteInput] = useState(false)

  // Re-seeded during render when a different complaint loads, rather than from
  // an effect that would commit an extra render each time.
  const [officerId,      setOfficerId]      = useState('')
  const [deptId,         setDeptId]         = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [seededFor,      setSeededFor]      = useState(null)
  if (complaint && complaint.id !== seededFor) {
    setSeededFor(complaint.id)
    setOfficerId(complaint.assignedOfficer ? String(complaint.assignedOfficer) : '')
    setDeptId(complaint._raw?.assignedDepartment ? String(complaint._raw.assignedDepartment) : '')
    setResolutionNote(complaint.resolutionNote || '')
    setShowNoteInput(false)
  }

  const assign = useMutation(
    useCallback(
      (payload) => complaintsApi.assign(id, payload, deptMap),
      [id, deptMap]
    )
  )

  // PATCH /api/complaints/:id/status — authorises admin, writes a
  // `complaint_status_updated` audit entry and notifies the assigned officer.
  const advance = useMutation(
    useCallback(
      ({ status, note }) => complaintsApi.setStatus(id, status, note, deptMap),
      [id, deptMap]
    )
  )

  const submitStatus = useCallback(async (next, note) => {
    // Resolving without a note leaves no record of what was done, so the note
    // box opens instead of the request being sent.
    if (next === 'resolved' && !String(note ?? '').trim()) {
      setShowNoteInput(true)
      return
    }
    const result = await advance.run({ status: next, note: note?.trim() || undefined })
    // The response is the updated complaint, so the screen reflects what the
    // database holds rather than what was requested.
    if (result.ok) {
      setData(result.data)
      setShowNoteInput(false)
    }
  }, [advance, setData])

  const submitAssignment = useCallback(async () => {
    // PATCH /api/complaints/:id/assign answers with the updated complaint, and
    // adaptComplaint reads both fields from bare ids, so it applies directly.
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
  const nextStatus = NEXT_STATUS[complaint.status]
  // No acknowledged timestamp exists, so workflow position is the only source.
  const hasAcknowledged = STATUS_ORDER.indexOf(complaint.status) >= STATUS_ORDER.indexOf('acknowledged')

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      <button
        onClick={() => navigate('/admin/complaints')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Complaints
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[13px] font-bold text-[#5E6AD2] dark:text-[#818CF8] font-mono">{complaint.cnrId}</span>
            <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${deptStyle(complaint.department)}`}>
              {complaint.department}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.dot }} />
              {status.text}
            </span>
          </div>
          <h2 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {complaint.issueType}
          </h2>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{complaint.address}</p>
        </div>

        {/* The only workflow write on this header. Advancing to `resolved`
            requires a resolution note, which is what the officer screens ask
            for too, so the record reads the same whoever closed it. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {nextStatus ? (
            <button
              onClick={() => submitStatus(nextStatus, resolutionNote)}
              disabled={advance.saving}
              className={`h-9 px-4 text-[13px] font-medium text-white rounded-[6px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${
                nextStatus === 'resolved'
                  ? 'bg-[#16A34A] hover:bg-[#15803D]'
                  : 'bg-[#5E6AD2] hover:bg-[#4A56C1]'
              }`}
            >
              {advance.saving
                ? 'Saving...'
                : `Mark ${COMPLAINT_STATUS_CONFIG[nextStatus]?.text || nextStatus}`}
            </button>
          ) : (
            <span className="text-[13px] font-medium text-[#16A34A] dark:text-[#4ADE80] flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Resolved
            </span>
          )}
        </div>
      </div>

      {advance.error && (
        <p className="text-[13px] text-[#DC2626] dark:text-[#F87171]">{advance.error.message}</p>
      )}

      {showNoteInput && (
        <Card>
          <SectionLabel>Resolution note (required to mark as resolved)</SectionLabel>
          <textarea
            value={resolutionNote}
            onChange={e => setResolutionNote(e.target.value)}
            placeholder="Describe how this complaint was resolved..."
            rows={3}
            className="w-full px-3 py-2.5 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowNoteInput(false)} disabled={advance.saving} className="px-4 py-2 text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              Cancel
            </button>
            <button
              onClick={() => submitStatus('resolved', resolutionNote)}
              disabled={!resolutionNote.trim() || advance.saving}
              className="px-4 py-2 text-[13px] font-medium text-white bg-[#16A34A] rounded-[6px] hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {advance.saving ? 'Saving...' : 'Confirm resolution'}
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">

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
          <InfoRow label="Acknowledged" value={hasAcknowledged ? 'Yes' : 'Not yet'} />
          {/* `updatedAt` under its own name rather than "Resolved on": the
              adapter's resolvedAt is only a proxy for it, so labelling it as a
              resolution time would overstate what the schema stores. */}
          <InfoRow label="Last updated" value={formatDateLong(complaint.updatedAt)} />
          {complaint.resolutionNote && (
            <div className="pt-3 mt-1">
              <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-1.5">Resolution note</p>
              <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{complaint.resolutionNote}</p>
            </div>
          )}
        </Card>

        <Card className="flex flex-col">
          <SectionLabel>Complaint location</SectionLabel>
          <div className="flex-1 flex flex-col gap-2">
            <LocationMap
              height="220px"
              points={[{ coord: { lat: complaint.lat, lng: complaint.lng }, color: '#DC2626', label: complaint.issueType }]}
              emptyMessage="This complaint was filed without coordinates."
            />
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{complaint.ward}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">{complaint.address}</p>
          </div>
        </Card>

      </div>

      {/* PATCH /api/complaints/:id/assign: either select is optional, clearing
          one sends null to unassign, and assigning an officer is what raises
          the `complaint_assigned` notification. */}
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

      <Card>
        <SectionLabel>Status timeline</SectionLabel>
        <StatusTimeline complaint={complaint} />
      </Card>

    </div>
  )
}
