// Single complaint: detail, status progression and resolution note.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useComplaint } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { complaintsApi } from '../../services'
import { COMPLAINT_STATUS_CONFIG, DEPT_STYLES } from '../../components/uiStyles'

function formatDateTime(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
}

const TIMELINE_STEPS = [
  { key: 'submitted', label: 'Submitted', dateKey: 'filedAt' },
  { key: 'acknowledged', label: 'Acknowledged', dateKey: 'acknowledgedAt' },
  { key: 'in_progress', label: 'In Progress', dateKey: null },
  { key: 'resolved', label: 'Resolved', dateKey: 'resolvedAt' },
]

const STATUS_ORDER = ['submitted', 'acknowledged', 'in_progress', 'resolved']

function Card({ children, className = '' }) {
  return <div className={`bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] p-5 ${className}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>{children}</div>
}

function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">{children}</p>
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
      <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] flex-shrink-0 w-36">{label}</span>
      <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right">{value || '-'}</span>
    </div>
  )
}

function StatusTimeline({ currentStatus, complaint }) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus)

  return (
    <div className="flex items-start gap-0">
      {TIMELINE_STEPS.map((step, index) => {
        const isDone = index <= currentIndex
        const isLast = index === TIMELINE_STEPS.length - 1
        const dateValue = step.dateKey ? complaint[step.dateKey] : null

        return (
          <div key={step.key} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div className={`flex-1 h-[2px] ${index === 0 ? 'invisible' : isDone ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${isDone ? 'border-[#5E6AD2] bg-[#5E6AD2]' : 'border-[#E5E5E5] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F]'}`}>
                {isDone ? (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-[#E5E5E5] dark:bg-[#374151]" />
                )}
              </div>
              <div className={`flex-1 h-[2px] ${isLast ? 'invisible' : isDone && index < currentIndex ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />
            </div>
            <div className="mt-2 text-center px-1">
              <p className={`text-[12px] font-semibold ${isDone ? 'text-[#0F172A] dark:text-[#F8FAFC]' : 'text-[#9CA3AF] dark:text-[#6B7280]'}`}>{step.label}</p>
              {dateValue && <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">{formatDateTime(dateValue)}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function OfficerComplaintDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: complaint, loading, error, reload } = useComplaint(id)
  // Both are edited before saving — the status by the workflow buttons, the note
  // by its textarea — so they stay as state. They are re-seeded during render
  // when a different complaint loads rather than from an effect, which would
  // commit an extra render every time.
  const [currentStatus, setCurrentStatus] = useState('submitted')
  const [resolutionNote, setResolutionNote] = useState('')
  const [seededFor, setSeededFor] = useState(null)
  if (complaint && complaint.id !== seededFor) {
    setSeededFor(complaint.id)
    setCurrentStatus(complaint.status)
    setResolutionNote(complaint.resolutionNote || '')
  }
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading complaint..." >{null}</AsyncState>
  }

  if (!complaint) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] text-[#6B7280]">Complaint not found</p>
        <button onClick={() => navigate('/officer/complaints')} className="mt-3 text-[13px] text-[#5E6AD2]">Back</button>
      </div>
    )
  }

  const status = COMPLAINT_STATUS_CONFIG[currentStatus] || COMPLAINT_STATUS_CONFIG.submitted
  const currentIndex = STATUS_ORDER.indexOf(currentStatus)

  // PATCH /api/complaints/:id/status
  async function handleUpdateStatus(nextStatus) {
    if (nextStatus === 'resolved' && !resolutionNote.trim()) {
      setShowNoteInput(true)
      return
    }
    try {
      const saved = await complaintsApi.setStatus(id, nextStatus)
      setCurrentStatus(saved.status)
      if (nextStatus !== 'resolved') setShowNoteInput(false)
    } catch { /* status left unchanged on failure */ }
  }

  async function handleResolveWithNote() {
    if (!resolutionNote.trim()) return
    try {
      const saved = await complaintsApi.setStatus(id, 'resolved', resolutionNote)
      setCurrentStatus(saved.status)
      setNoteSaved(true)
      setShowNoteInput(false)
    } catch { /* keep the note box open so the officer can retry */ }
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>
      <button onClick={() => navigate('/officer/complaints')} className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Complaints
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[13px] font-bold text-[#5E6AD2] dark:text-[#818CF8] font-mono">{complaint.cnrId}</span>
            <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${DEPT_STYLES[complaint.department] || DEPT_STYLES.Other}`}>{complaint.department}</span>
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.dot }} />
              {status.text}
            </span>
          </div>
          <h1 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">{complaint.issueType}</h1>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{complaint.address}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 mt-1 flex-wrap">
          {currentIndex < 3 && (
            <>
              {currentIndex === 0 && <button onClick={() => handleUpdateStatus('acknowledged')} className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">Mark Acknowledged</button>}
              {currentIndex === 1 && <button onClick={() => handleUpdateStatus('in_progress')} className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">Mark In Progress</button>}
              {currentIndex === 2 && <button onClick={() => handleUpdateStatus('resolved')} className="h-9 px-4 text-[13px] font-medium text-white bg-[#16A34A] rounded-[6px] hover:bg-[#15803D] transition-colors">Mark Resolved</button>}
            </>
          )}
          {currentIndex === 3 && <span className="text-[13px] font-medium text-[#16A34A] dark:text-[#4ADE80] flex items-center gap-1.5"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Resolved</span>}
        </div>
      </div>

      {showNoteInput && (
        <Card>
          <SectionLabel>Resolution note (required to mark as resolved)</SectionLabel>
          <textarea
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            rows={3}
            placeholder="Describe how this complaint was resolved..."
            className="w-full px-3 py-2.5 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowNoteInput(false)} className="px-4 py-2 text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">Cancel</button>
            <button onClick={handleResolveWithNote} disabled={!resolutionNote.trim()} className="px-4 py-2 text-[13px] font-medium text-white bg-[#16A34A] rounded-[6px] hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Confirm resolution</button>
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
          <InfoRow label="CNR ID" value={complaint.cnrId} />
          <InfoRow label="Issue type" value={complaint.issueType} />
          <InfoRow label="Ward" value={complaint.ward} />
          <InfoRow label="Filed on" value={formatDateTime(complaint.filedAt)} />
          <InfoRow label="Acknowledged" value={complaint.acknowledgedAt ? formatDateTime(complaint.acknowledgedAt) : 'Not yet'} />
          <InfoRow label="Resolved" value={currentStatus === 'resolved' ? 'Yes' : 'Not yet'} />
          {(noteSaved || complaint.resolutionNote) && (
            <div className="pt-3 mt-1 border-t border-[#F3F4F6] dark:border-[#27272A]">
              <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-1.5">Resolution note</p>
              <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{resolutionNote || complaint.resolutionNote}</p>
            </div>
          )}
        </Card>

        <Card className="flex flex-col">
          <SectionLabel>Complaint location</SectionLabel>
          <div className="flex-1 rounded-[8px] flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]" style={{ minHeight: '220px' }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] mb-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <p className="text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">{complaint.ward}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1 text-center px-6 leading-relaxed">{complaint.address}</p>
            <p className="text-[11px] text-[#D1D5DB] dark:text-[#374151] mt-4">Pin map loads in Phase 3</p>
          </div>
        </Card>
      </div>

      <Card>
        <SectionLabel>Status timeline</SectionLabel>
        <StatusTimeline currentStatus={currentStatus} complaint={complaint} />
      </Card>
    </div>
  )
}
