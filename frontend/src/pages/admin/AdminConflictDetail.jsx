// Conflict resolution workspace.
//
// Presents the two clashing projects side by side with their MCDM scores, since
// the score is what justifies rejecting one over the other. Resolving here sets
// the administrator's decision; where that requires a reschedule, the owning
// officer must still respond before the conflict closes.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConflict, useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { conflictsApi, normaliseError } from '../../services'
import { useAuth } from '../../hooks/useAuth'
import { CONFLICT_STATUS_CONFIG, DEPT_STYLES, SEVERITY_CONFIG, TYPE_STYLES, scoreColor } from '../../components/uiStyles'
import { formatDate, formatDateLong, daysSince, MCDM_CRITERIA, criterionWidth } from '../../components/dashboard'

// ─── Helpers ───────────────────────────────────



// ─── Small components ──────────────────────────
function Badge({ label, className }) {
  return <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${className}`}>{label}</span>
}

function StatusBadge({ status }) {
  const c = CONFLICT_STATUS_CONFIG[status] || CONFLICT_STATUS_CONFIG.unresolved
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.color}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {c.text}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const c = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low
  return <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${c.bg} ${c.color}`}>{c.text}</span>
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] ${className}`}
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
    <div className="flex items-start justify-between py-2 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
      <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] flex-shrink-0">{label}</span>
      <span className="text-[12px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right ml-4">{value || '—'}</span>
    </div>
  )
}

// ─── Project Panel ─────────────────────────────
// `score` and `breakdown` are passed in rather than derived from `isHigher`:
// the higher-scoring side is whichever the backend would keep, not necessarily
// project1, so the panel must not infer which figures belong to it.
function ProjectPanel({ project, score, breakdown, isHigher }) {
  if (!project) return null

  return (
    <Card className="p-5 flex flex-col gap-4 flex-1">
      {/* Priority label */}
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full ${
          isHigher
            ? 'bg-[#EEF2FF] dark:bg-[#131629] text-[#4338CA] dark:text-[#818CF8]'
            : 'bg-[#F8FAFC] dark:bg-[#1A1F2B] text-[#6B7280] dark:text-[#9CA3AF]'
        }`}>
          {isHigher ? '★ Higher Priority' : 'Lower Priority'}
        </span>
        <span className="text-[24px] font-bold leading-none" style={{ color: scoreColor(score) }}>
          {score}
        </span>
      </div>

      {/* Title + badges */}
      <div>
        <h3 className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug mb-2">
          {project.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={project.department} className={DEPT_STYLES[project.department] || DEPT_STYLES.PWD} />
          <Badge label={project.type}       className={TYPE_STYLES[project.type] || TYPE_STYLES.Other} />
        </div>
      </div>

      {/* Info rows */}
      <div>
        <InfoRow label="Start date"  value={formatDateLong(project.startDate)} />
        <InfoRow label="End date"    value={formatDateLong(project.endDate)} />
        <InfoRow label="Officer"     value={project.officerName} />
        <InfoRow label="Ward"        value={project.ward} />
        <InfoRow label="Cost"        value={project.estimatedCost ? `₹${(project.estimatedCost / 100000).toFixed(2)} L` : '—'} />
      </div>

      {/* MCDM criteria bars */}
      <div>
        <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">
          MCDM breakdown
        </p>
        <div className="flex flex-col gap-2.5">
          {MCDM_CRITERIA.map(c => (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">{c.label}</span>
                <span className="text-[10px] font-semibold text-[#9CA3AF] dark:text-[#6B7280]">{c.weight}%</span>
              </div>
              <div className="h-[4px] bg-[#F3F4F6] dark:bg-[#27272A] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: criterionWidth(breakdown, c.key),
                    backgroundColor: isHigher ? '#5E6AD2' : '#9CA3AF',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── Admin Conflict Detail ─────────────────────
export default function AdminConflictDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { deptMap } = useAuth()
  const { data: conflict, loading, error, reload } = useConflict(id)
  const { data: projects } = useProjects()

  // `conflict` is null on the first render, so seeding from it once would leave
  // this stuck at 'unresolved' and keep the resolution panel live on a conflict
  // the backend has already actioned — which then 409s. Re-seeded during render
  // when a different conflict loads, rather than from an effect.
  const [resolutionStatus, setResolutionStatus] = useState('unresolved')
  const [seededFor,        setSeededFor]        = useState(null)
  const [actionDone,       setActionDone]       = useState(null)
  const [activeOption,     setActiveOption]     = useState(null) // 'approve_both' | 'reject_one'
  const [coordNote,        setCoordNote]        = useState('')
  const [rejectReason,     setRejectReason]     = useState('')
  const [resolveError,     setResolveError]     = useState('')

  if (conflict && conflict.id !== seededFor) {
    setSeededFor(conflict.id)
    setResolutionStatus(conflict.status)
    setActionDone(null)
    setActiveOption(null)
    setResolveError('')
  }

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading conflict..." >{null}</AsyncState>
  }

  if (!conflict) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] font-medium text-[#6B7280]">Conflict not found</p>
        <button onClick={() => navigate('/admin/conflicts')} className="mt-3 text-[13px] text-[#5E6AD2] font-medium">
          ← Back to Conflicts
        </button>
      </div>
    )
  }

  const projectA = projects.find(p => p.id === conflict.projectAId)
  const projectB = projects.find(p => p.id === conflict.projectBId)
  const days     = daysSince(conflict.detectedAt)
  const canAct   = resolutionStatus === 'unresolved' && !actionDone

  // `reject_lower` defers whichever project scores lower — which may be either
  // side. The adapter resolves that from the scores using the backend's own
  // rule; the two sides are named from it so the recommendation, the priority
  // labels and the confirm button all describe the project that will actually
  // be deferred.
  const aIsHigher = conflict.higherPriorityId === conflict.projectAId
  const keep = aIsHigher
    ? { project: projectA, title: conflict.projectATitle, dept: conflict.projectADept, score: conflict.projectAScore, breakdown: conflict.projectABreakdown }
    : { project: projectB, title: conflict.projectBTitle, dept: conflict.projectBDept, score: conflict.projectBScore, breakdown: conflict.projectBBreakdown }
  const defer = aIsHigher
    ? { project: projectB, title: conflict.projectBTitle, dept: conflict.projectBDept, score: conflict.projectBScore, breakdown: conflict.projectBBreakdown }
    : { project: projectA, title: conflict.projectATitle, dept: conflict.projectADept, score: conflict.projectAScore, breakdown: conflict.projectABreakdown }

  // PUT /api/conflicts/:id/resolve
  async function handleApproveBoth() {
    if (!coordNote.trim()) return
    setResolveError('')
    try {
      const saved = await conflictsApi.resolve(id, { action: 'approve_both', coordinationNote: coordNote }, deptMap)
      setResolutionStatus(saved.status)
      setActionDone('approve_both')
      setActiveOption(null)
    } catch (err) {
      // The panel stays open so the admin can retry, but the reason is now
      // shown: an already-actioned conflict returns 409, which was silent.
      setResolveError(normaliseError(err).message)
    }
  }

  async function handleRejectOne() {
    if (!rejectReason.trim()) return
    setResolveError('')
    try {
      const saved = await conflictsApi.resolve(id, { action: 'reject_lower', coordinationNote: rejectReason }, deptMap)
      setResolutionStatus(saved.status)
      setActionDone('reject_one')
      setActiveOption(null)
    } catch (err) {
      setResolveError(normaliseError(err).message)
    }
  }

  // Timeline bar widths
  const allDates = [
    projectA?.startDate, projectA?.endDate,
    projectB?.startDate, projectB?.endDate,
  ].filter(Boolean).map(d => new Date(d))
  // A clashing project the viewer cannot see leaves allDates empty; Math.min
  // would then yield Infinity and toISOString() would throw.
  const hasTimeline = allDates.length > 0
  const minDate = hasTimeline ? new Date(Math.min(...allDates)) : null
  const maxDate = hasTimeline ? new Date(Math.max(...allDates)) : null
  const totalMs = maxDate - minDate

  function barStyle(start, end, color) {
    const s = new Date(start)
    const e = new Date(end)
    const left  = ((s - minDate) / totalMs) * 100
    const width = ((e - s) / totalMs) * 100
    return { left: `${left}%`, width: `${width}%`, backgroundColor: color }
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Back ── */}
      <button
        onClick={() => navigate('/admin/conflicts')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Conflicts
      </button>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <SeverityBadge severity={conflict.severity} />
            <StatusBadge   status={resolutionStatus} />
            <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">Detected {days}d ago</span>
          </div>
          <h1 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {conflict.projectADept} ↔ {conflict.projectBDept} Clash
          </h1>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{conflict.overlapDescription}</p>
        </div>
      </div>

      {/* ══ ROW 1: Two project panels ══ */}
      <div className="grid grid-cols-2 gap-4">
        <ProjectPanel project={keep.project}  score={keep.score}  breakdown={keep.breakdown}  isHigher={true}  />
        <ProjectPanel project={defer.project} score={defer.score} breakdown={defer.breakdown} isHigher={false} />
      </div>

      {/* ══ ROW 2: Map placeholder ══ */}
      <Card className="p-5">
        <SectionLabel>Overlap location</SectionLabel>
        <div
          className="rounded-[8px] flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
          style={{ height: '180px' }}
        >
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mb-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <p className="text-[13px] font-medium text-[#9CA3AF] dark:text-[#6B7280]">{conflict.overlapDescription}</p>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">
              {projectA?.ward} · {projectB?.ward}
            </span>
          </div>
          <p className="text-[11px] text-[#D1D5DB] dark:text-[#374151] mt-3">Interactive map in Phase 3</p>
        </div>
      </Card>

      {/* ══ ROW 3: Timeline ══ */}
      <Card className="p-5">
        <SectionLabel>Timeline overlap</SectionLabel>
        <div className="flex flex-col gap-4">
          {/* Legend */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#5E6AD2]" />
              <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{conflict.projectADept} — {projectA?.title?.split('—')[0]?.trim()}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#9CA3AF]" />
              <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{conflict.projectBDept} — {projectB?.title?.split('—')[0]?.trim()}</span>
            </div>
          </div>

          {/* Bar track */}
          <div className="relative" style={{ height: '56px' }}>
            {/* Project A bar */}
            {projectA && (
              <div
                className="absolute h-5 rounded-full top-0 flex items-center px-2"
                style={barStyle(projectA.startDate, projectA.endDate, '#5E6AD2')}
              >
                <span className="text-[10px] font-semibold text-white truncate">{formatDate(projectA.startDate)}</span>
              </div>
            )}
            {/* Project B bar */}
            {projectB && (
              <div
                className="absolute h-5 rounded-full bottom-0 flex items-center px-2"
                style={barStyle(projectB.startDate, projectB.endDate, '#9CA3AF')}
              >
                <span className="text-[10px] font-semibold text-white truncate">{formatDate(projectB.startDate)}</span>
              </div>
            )}
          </div>

          {/* Date labels */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">{hasTimeline ? formatDate(minDate.toISOString()) : '—'}</span>
            <span className="text-[12px] font-medium text-[#DC2626] dark:text-[#FCA5A5]">
              {conflict.overlapDays} days overlap
            </span>
            <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">{hasTimeline ? formatDate(maxDate.toISOString()) : '—'}</span>
          </div>
        </div>
      </Card>

      {/* ══ ROW 4: Resolution History (if previously actioned) ══ */}
      {conflict.adminNote && (
        <Card className="p-5">
          <SectionLabel>Resolution history</SectionLabel>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border border-[#E0E7FF] dark:border-[#252870]">
              RK
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                {conflict.resolution?.resolvedBy || 'Admin'}
                <span className="font-normal text-[#6B7280] dark:text-[#9CA3AF]"> · {
                  conflict.resolution?.type === 'approve_both' ? 'Approved both with coordination' :
                  conflict.resolution?.type === 'reject_lower' ? 'Rejected lower priority project' : 'Resolved'
                }</span>
              </p>
              <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">{formatDateLong(conflict.resolution?.resolvedAt)}</p>
              <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] mt-2 leading-relaxed">{conflict.adminNote}</p>
              {conflict.resolution?.suggestedDate && (
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
                  Suggested date: <span className="font-medium">{formatDateLong(conflict.resolution.suggestedDate)}</span>
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ══ ROW 5: Admin Actions ══ */}
      <Card className="p-5">
        <SectionLabel>Resolution actions</SectionLabel>

        {resolveError && (
          <p className="text-[13px] text-[#DC2626] dark:text-[#F87171] mb-3">{resolveError}</p>
        )}

        {/* Already actioned */}
        {actionDone === 'approve_both' && (
          <div className="flex items-center gap-2 text-[#15803D] dark:text-[#4ADE80]">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span className="text-[14px] font-semibold">Both projects approved with coordination note</span>
          </div>
        )}
        {actionDone === 'reject_one' && (
          <div className="flex items-center gap-2 text-[#D97706] dark:text-[#FACC15]">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span className="text-[14px] font-semibold">Lower priority project rejected — officer notified</span>
          </div>
        )}

        {/* Read-only state for conflicts already actioned on the server */}
        {!canAct && !actionDone && (
          <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280]">
            This conflict has already been {resolutionStatus === 'resolved' ? 'resolved' : 'actioned'}. No further action required.
          </p>
        )}

        {/* Action options */}
        {canAct && (
          <div className="flex flex-col gap-4">
            {/* System recommendation */}
            <div className="flex items-start gap-3 px-4 py-3 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] border border-[#C7D2FE] dark:border-[#252870]">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-[13px] text-[#4338CA] dark:text-[#818CF8]">
                <span className="font-semibold">System recommends: </span>
                Approve <span className="font-semibold">{keep.dept}</span> project (higher MCDM {keep.score}) and reject <span className="font-semibold">{defer.dept}</span> project (MCDM {defer.score}).
              </p>
            </div>

            {/* Option buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setActiveOption(activeOption === 'approve_both' ? null : 'approve_both')}
                className={`px-4 py-3 rounded-[8px] border text-[13px] font-medium transition-all text-left ${
                  activeOption === 'approve_both'
                    ? 'border-[#5E6AD2] bg-[#EEF2FF] dark:bg-[#131629] text-[#4338CA] dark:text-[#818CF8]'
                    : 'border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#5E6AD2]/50'
                }`}
              >
                <p className="font-semibold mb-0.5">Option 1 — Approve Both</p>
                <p className="text-[12px] opacity-70">Both projects proceed with coordination note and adjusted dates</p>
              </button>
              <button
                onClick={() => setActiveOption(activeOption === 'reject_one' ? null : 'reject_one')}
                className={`px-4 py-3 rounded-[8px] border text-[13px] font-medium transition-all text-left ${
                  activeOption === 'reject_one'
                    ? 'border-[#DC2626] bg-[#FEF2F2] dark:bg-[#1F0A0A] text-[#B91C1C] dark:text-[#F87171]'
                    : 'border-[#E2E8F0] dark:border-[#27272A] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#DC2626]/50'
                }`}
              >
                <p className="font-semibold mb-0.5">Option 2 — Reject Lower Priority</p>
                <p className="text-[12px] opacity-70">Reject {defer.dept} project — officer gets suggested reschedule date</p>
              </button>
            </div>

            {/* Option 1 — Approve Both input */}
            {activeOption === 'approve_both' && (
              <div className="flex flex-col gap-3 p-4 rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]">
                <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">Coordination note</p>
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">Describe how both projects will proceed together. This note will be visible to both officers.</p>
                <textarea
                  value={coordNote}
                  onChange={e => setCoordNote(e.target.value)}
                  placeholder="e.g. PVVNL to complete junction cabling by Jan 28. PWD to begin surface work from Feb 1..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleApproveBoth}
                    disabled={!coordNote.trim()}
                    className="px-5 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Confirm — Approve Both
                  </button>
                </div>
              </div>
            )}

            {/* Option 2 — Reject One input */}
            {activeOption === 'reject_one' && (
              <div className="flex flex-col gap-3 p-4 rounded-[8px] bg-[#FEF2F2] dark:bg-[#1F0A0A] border border-[#FECACA] dark:border-[#7F1D1D]">
                <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">Rejection reason</p>
                <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
                  Rejecting <span className="font-medium">{defer.title}</span>. The officer will receive this reason along with a suggested start date.
                </p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleRejectOne}
                    disabled={!rejectReason.trim()}
                    className="px-5 py-2 text-[13px] font-medium text-white bg-[#DC2626] rounded-[6px] hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Confirm — Reject {defer.dept} Project
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

    </div>
  )
}