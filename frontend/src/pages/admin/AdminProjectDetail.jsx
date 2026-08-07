// Single project: full record, MCDM breakdown, clashes and approval actions.
// Approval and rejection are administrator-only and both notify the owning
// officer; rejection carries a suggested start date the officer can counter.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProject, useConflicts, useAuditLogs } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { projectsApi, normaliseError } from '../../services'
import { formatDateLong, relativeDay, auditActionLabel, MCDM_CRITERIA, criterionWidth } from '../../components/dashboard'
import { useAuth } from '../../hooks/useAuth'
import { DEPT_STYLES, PROJECT_STATUS_CONFIG, TYPE_STYLES } from '../../components/uiStyles'

function formatCurrency(n) {
  if (!n) return '—'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`
  return `₹${n.toLocaleString('en-IN')}`
}


function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// `key` matches the mcdmBreakdown field the engine writes for each criterion,
// so each bar shows its own score rather than the overall total.


function Badge({ label, className }) {
  return (
    <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${className}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }) {
  const c = PROJECT_STATUS_CONFIG[status] || PROJECT_STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${c.bg} ${c.color}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {c.text}
    </span>
  )
}

function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] ${className}`}
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">
      {children}
    </p>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
      <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] flex-shrink-0 w-44">{label}</span>
      <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right">{value || '—'}</span>
    </div>
  )
}

function RejectModal({ onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div
        className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[12px] p-6 w-full max-w-md mx-4"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
      >
        <h3 className="text-[16px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Reject Project</h3>
        <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mb-4">
          Provide a reason for rejection. The officer will be notified with this reason and a suggested reschedule date.
        </p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Enter rejection reason..."
          rows={4}
          className="w-full px-3 py-2.5 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
        />
        <div className="flex items-center gap-3 mt-4 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F1F5F9] dark:hover:bg-[#252529] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason)}
            disabled={!reason.trim()}
            className="px-4 py-2 text-[13px] font-medium text-white bg-[#DC2626] rounded-[6px] hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminProjectDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { deptMap } = useAuth()
  const { data: project, loading, error, reload } = useProject(id)
  const { data: conflicts } = useConflicts()
  const { data: auditLogs } = useAuditLogs()

  // `project` is null on the first render, so seeding once would leave this at
  // 'pending' and keep Approve/Reject live on an already-decided project.
  // Re-seeded during render rather than from an effect that costs a render.
  const [projectStatus,   setProjectStatus]   = useState('pending')
  const [seededFor,       setSeededFor]       = useState(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [actionDone,      setActionDone]      = useState(null)
  const [actionError,     setActionError]     = useState('')

  if (project && project.id !== seededFor) {
    setSeededFor(project.id)
    setProjectStatus(project.status)
    setActionDone(null)
  }

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading project..." >{null}</AsyncState>
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] font-medium text-[#6B7280]">Project not found</p>
        <button onClick={() => navigate('/admin/projects')} className="mt-3 text-[13px] text-[#5E6AD2] font-medium">
          ← Back to Projects
        </button>
      </div>
    )
  }

  const clash = conflicts.find(c =>
    (c.projectAId === project.id || c.projectBId === project.id) &&
    c.status === 'unresolved'
  )

  const projectAudit = auditLogs
    .filter(a => a.resourceId === project.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const canTakeAction = projectStatus === 'pending' && !actionDone

  // PUT /api/projects/:id/approve
  async function handleApprove() {
    setActionError('')
    try {
      const saved = await projectsApi.approve(id, undefined, deptMap)
      setProjectStatus(saved.status)
      setActionDone('approved')
    } catch (err) {
      setActionError(normaliseError(err).message)
    }
  }

  // PUT /api/projects/:id/reject
  async function handleReject(reason) {
    setActionError('')
    try {
      const saved = await projectsApi.reject(id, reason, undefined, deptMap)
      setProjectStatus(saved.status)
      setActionDone('rejected')
    } catch (err) {
      setActionError(normaliseError(err).message)
    } finally {
      setShowRejectModal(false)
    }
  }

  const scoreColor = project.mcdmScore >= 75 ? '#16A34A' : project.mcdmScore >= 60 ? '#D97706' : '#DC2626'
  const scoreLabel = project.mcdmScore >= 75 ? 'High priority' : project.mcdmScore >= 60 ? 'Medium priority' : 'Low priority'

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      <button
        onClick={() => navigate('/admin/projects')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Projects
      </button>

      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2.5">
            <Badge label={project.department} className={DEPT_STYLES[project.department] || DEPT_STYLES.PWD} />
            <Badge label={project.type}       className={TYPE_STYLES[project.type] || TYPE_STYLES.Other} />
            <StatusBadge status={projectStatus} />
            {project.phase === 'phased' && (
              <span className="text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF] px-2 py-0.5 rounded-full border border-[#E2E8F0] dark:border-[#27272A]">
                Phased project
              </span>
            )}
            {project.hasClash && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B91C1C] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#1F0A0A] px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }} />
                Clash detected
              </span>
            )}
          </div>
          <h1 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
            {project.title}
          </h1>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{project.departmentFull}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          {actionError && (
            <span className="text-[13px] text-[#DC2626] dark:text-[#F87171]">{actionError}</span>
          )}
          {actionDone === 'approved' && (
            <span className="text-[13px] text-[#15803D] dark:text-[#4ADE80] font-medium flex items-center gap-1.5">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Project approved
            </span>
          )}
          {actionDone === 'rejected' && (
            <span className="text-[13px] text-[#B91C1C] dark:text-[#F87171] font-medium flex items-center gap-1.5">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Project rejected
            </span>
          )}
          {canTakeAction && (
            <>
              <button
                className="h-9 px-4 text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors"
                title="Override MCDM — available in Phase 3"
              >
                Override MCDM
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="h-9 px-4 text-[13px] font-medium text-white bg-[#DC2626] rounded-[6px] hover:bg-[#B91C1C] transition-colors"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors"
              >
                Approve
              </button>
            </>
          )}
        </div>
      </div>

      {clash && (
        <div
          onClick={() => navigate(`/admin/conflicts/${clash.id}`)}
          className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-[#FEF2F2] dark:bg-[#1F0A0A] border border-[#FECACA] dark:border-[#7F1D1D] cursor-pointer hover:border-[#DC2626]/60 transition-colors"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#B91C1C] dark:text-[#F87171]">
              Clash detected with another project
            </p>
            <p className="text-[12px] text-[#B91C1C]/80 dark:text-[#F87171]/70 truncate mt-0.5">
              {clash.projectAId === project.id ? clash.projectBTitle : clash.projectATitle} · {clash.overlapDescription}
            </p>
          </div>
          <span className="text-[12px] text-[#DC2626] font-medium flex-shrink-0 flex items-center gap-1">
            View conflict
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>

        <Card className="p-5">
          <SectionLabel>MCDM priority score</SectionLabel>
          <div className="flex items-end gap-4 mb-5 pb-5 border-b border-[#F3F4F6] dark:border-[#27272A]">
            <span className="text-[56px] font-bold leading-none" style={{ color: scoreColor }}>
              {project.mcdmScore}
            </span>
            <div className="flex flex-col pb-1 gap-0.5">
              <span className="text-[16px] font-medium text-[#9CA3AF] dark:text-[#6B7280]">/ 100</span>
              <span className="text-[13px] font-medium" style={{ color: scoreColor }}>{scoreLabel}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {MCDM_CRITERIA.map(c => (
              <div key={c.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{c.label}</span>
                  <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280]">{c.weight}%</span>
                </div>
                <div className="h-[5px] bg-[#F3F4F6] dark:bg-[#27272A] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5E6AD2]"
                    style={{
                      width: criterionWidth(project.mcdmBreakdown, c.key),
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 flex flex-col">
          <SectionLabel>Location</SectionLabel>
          <div
            className="flex-1 rounded-[8px] flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
            style={{ minHeight: '200px' }}
          >
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mb-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <p className="text-[14px] font-semibold text-[#6B7280] dark:text-[#9CA3AF]">{project.ward}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1 text-center px-6 leading-relaxed">{project.address}</p>
            <p className="text-[11px] text-[#D1D5DB] dark:text-[#374151] mt-4">Interactive map in Phase 3</p>
          </div>
        </Card>

      </div>

      <Card className="p-5">
        <SectionLabel>Project information</SectionLabel>

        <div className="mb-4 pb-4 border-b border-[#F3F4F6] dark:border-[#27272A]">
          <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-2">Description</p>
          <p className="text-[14px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{project.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-x-12">
          <div>
            <InfoRow label="Submitted by"    value={project.officerName} />
            <InfoRow label="Submission date" value={formatDateLong(project.submittedAt)} />
            <InfoRow label="Start date"      value={formatDateLong(project.startDate)} />
            <InfoRow label="End date"        value={formatDateLong(project.endDate)} />
            <InfoRow label="Estimated cost"  value={formatCurrency(project.estimatedCost)} />
            <InfoRow label="Budget source"   value={project.budgetSource} />
          </div>
          <div>
            <InfoRow label="Tender number" value={project.tenderNumber} />
            <InfoRow label="Contractor"    value={project.contractorName ? `${project.contractorName} · ${project.contractorFirm}` : '—'} />
            <InfoRow label="Supervisor"    value={project.supervisorName || 'Not assigned'} />
            <InfoRow label="Ward"          value={project.ward} />
            <InfoRow label="Zone"          value={project.zone} />
            <InfoRow label="Address"       value={project.address} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionLabel>Audit trail</SectionLabel>
        {projectAudit.length === 0 ? (
          <p className="text-[13px] text-[#9CA3AF] text-center py-6">No actions recorded yet for this project</p>
        ) : (
          <div className="flex flex-col">
            {projectAudit.map((log, i) => (
              <div
                key={log.id}
                className={`flex items-start gap-3 py-3 ${i < projectAudit.length - 1 ? 'border-b border-[#F3F4F6] dark:border-[#27272A]' : ''}`}
              >
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border border-[#E0E7FF] dark:border-[#252870]">
                  {getInitials(log.userName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">
                    <span className="font-semibold">{log.userName}</span>
                    <span className="text-[#6B7280] dark:text-[#9CA3AF]"> · {auditActionLabel(log.action)}</span>
                  </p>
                  {log.description && (
                    <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">{log.description}</p>
                  )}
                </div>
                <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] flex-shrink-0">{relativeDay(log.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showRejectModal && (
        <RejectModal
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
