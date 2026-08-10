// Conflict resolution workspace. The two clashing projects sit side by side with
// their MCDM scores, since the score is what justifies rejecting one. Where the
// decision requires a reschedule, the owning officer must still respond.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConflict, useProjects } from '../../hooks/useResources'
import { useOwnsPageHeading } from '../../hooks/usePageHeading'
import AsyncState from '../../components/AsyncState'
import { conflictsApi, normaliseError } from '../../services'
import { useAuth } from '../../hooks/useAuth'
import { CONFLICT_STATUS_CONFIG, deptStyle, SEVERITY_CONFIG, TYPE_STYLES, scoreColor } from '../../components/uiStyles'
import { formatDate, formatDateLong, daysSince, MCDM_CRITERIA, criterionWidth, UNMEASURED_CRITERION_NOTE } from '../../components/dashboard'
import { LocationMap } from '../../gis'

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

// `score` and `breakdown` are passed in rather than derived from `isHigher`:
// the higher-scoring side is whichever the backend would keep, not necessarily
// project1, so the panel must not infer which figures belong to it.
function ProjectPanel({ project, score, breakdown, isHigher }) {
  if (!project) return null

  return (
    <Card className="p-5 flex flex-col gap-4 flex-1">
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

      <div>
        <h3 className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug mb-2">
          {project.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={project.department} className={deptStyle(project.department)} />
          <Badge label={project.type}       className={TYPE_STYLES[project.type] || TYPE_STYLES.Other} />
        </div>
      </div>

      <div>
        <InfoRow label="Start date"  value={formatDateLong(project.startDate)} />
        <InfoRow label="End date"    value={formatDateLong(project.endDate)} />
        <InfoRow label="Officer"     value={project.officerName} />
        <InfoRow label="Ward"        value={project.ward} />
        <InfoRow label="Cost"        value={project.estimatedCost ? `₹${(project.estimatedCost / 100000).toFixed(2)} L` : '—'} />
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">
          MCDM breakdown
        </p>
        <div className="flex flex-col gap-2.5">
          {MCDM_CRITERIA.map(c => (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-1" title={c.measured === false ? UNMEASURED_CRITERION_NOTE : undefined}>
                <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">{c.label}</span>
                <span className="text-[10px] font-semibold text-[#9CA3AF] dark:text-[#6B7280]">
                  {c.measured === false ? `${c.weight}% · n/m` : `${c.weight}%`}
                </span>
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

export default function AdminConflictDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { deptMap } = useAuth()
  const { data: conflict, loading, error, reload } = useConflict(id)
  const { data: projects } = useProjects()
  useOwnsPageHeading(Boolean(conflict))

   // Seed local state when a different conflict loads.
  const [resolutionStatus, setResolutionStatus] = useState('unresolved')
  const [seededFor,        setSeededFor]        = useState(null)
  const [actionDone,       setActionDone]       = useState(null)
  const [activeOption,     setActiveOption]     = useState(null) // 'approve_both' | 'reject_one'
  const [coordNote,        setCoordNote]        = useState('')
  const [rejectReason,     setRejectReason]     = useState('')
  const [resolveError,     setResolveError]     = useState('')

  // Admin decision override details.
  const [overrideOn,       setOverrideOn]       = useState(false)
  const [overrideCategory, setOverrideCategory] = useState('')
  const [overrideReason,   setOverrideReason]   = useState('')
  const [overrideRef,      setOverrideRef]      = useState('')

  if (conflict && conflict.id !== seededFor) {
    setSeededFor(conflict.id)
    setResolutionStatus(conflict.status)
    setActionDone(null)
    setActiveOption(null)
    setResolveError('')
    setOverrideOn(false)
    setOverrideCategory('')
    setOverrideReason('')
    setOverrideRef('')
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

  // `reject_lower` defers whichever project scores lower, which may be either
  // side; the adapter resolves that using the backend's own rule. Both sides are
  // named from it so recommendation, labels and button describe one project.
  const aIsHigher = conflict.higherPriorityId === conflict.projectAId
  const keep = aIsHigher
    ? { project: projectA, title: conflict.projectATitle, dept: conflict.projectADept, score: conflict.projectAScore, breakdown: conflict.projectABreakdown }
    : { project: projectB, title: conflict.projectBTitle, dept: conflict.projectBDept, score: conflict.projectBScore, breakdown: conflict.projectBBreakdown }
  const defer = aIsHigher
    ? { project: projectB, title: conflict.projectBTitle, dept: conflict.projectBDept, score: conflict.projectBScore, breakdown: conflict.projectBBreakdown }
    : { project: projectA, title: conflict.projectATitle, dept: conflict.projectADept, score: conflict.projectAScore, breakdown: conflict.projectABreakdown }

  // Both override fields are required together: a category with no stated reason
  // would put an OVERRIDE badge in the audit trail that explains nothing.
  const overrideIncomplete = overrideOn && !(overrideCategory.trim() && overrideReason.trim())

  // Sent only when the administrator has actually declared an override, so an
  // ordinary resolution records isOverride: false exactly as it does today.
  const overridePayload = () =>
    overrideOn
      ? {
          overrideCategory: overrideCategory.trim(),
          overrideReason: overrideReason.trim(),
          // Optional: a file, minute or order number backing the decision.
          ...(overrideRef.trim() ? { overrideRef: overrideRef.trim() } : {}),
        }
      : {}

  // PUT /api/conflicts/:id/resolve
  async function handleApproveBoth() {
    if (!coordNote.trim() || overrideIncomplete) return
    setResolveError('')
    try {
      const saved = await conflictsApi.resolve(
        id,
        { action: 'approve_both', coordinationNote: coordNote, ...overridePayload() },
        deptMap
      )
      setResolutionStatus(saved.status)
      setActionDone('approve_both')
      setActiveOption(null)
    } catch (err) {
      // The panel stays open so the admin can retry, and the reason is shown:
      // an already-actioned conflict returns 409.
      setResolveError(normaliseError(err).message)
    }
  }

  async function handleRejectOne() {
    if (!rejectReason.trim() || overrideIncomplete) return
    setResolveError('')
    try {
      const saved = await conflictsApi.resolve(
        id,
        { action: 'reject_lower', coordinationNote: rejectReason, ...overridePayload() },
        deptMap
      )
      setResolutionStatus(saved.status)
      setActionDone('reject_one')
      setActiveOption(null)
    } catch (err) {
      setResolveError(normaliseError(err).message)
    }
  }

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

      <button
        onClick={() => navigate('/admin/conflicts')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Conflicts
      </button>

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

      <div className="grid grid-cols-2 gap-4">
        <ProjectPanel project={keep.project}  score={keep.score}  breakdown={keep.breakdown}  isHigher={true}  />
        <ProjectPanel project={defer.project} score={defer.score} breakdown={defer.breakdown} isHigher={false} />
      </div>

      <Card className="p-5">
        <SectionLabel>Overlap location</SectionLabel>
        <div className="flex flex-col gap-2">
          <LocationMap
            height="180px"
            points={[
              { coord: conflict.projectACoords, color: '#5E6AD2', label: conflict.projectATitle },
              { coord: conflict.projectBCoords, color: '#9CA3AF', label: conflict.projectBTitle },
            ]}
            emptyMessage="Neither project records coordinates, so the overlap cannot be mapped."
          />
          <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{conflict.overlapDescription}</p>
        </div>
      </Card>

      <Card className="p-5">
        <SectionLabel>Timeline overlap</SectionLabel>
        <div className="flex flex-col gap-4">
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

          <div className="relative" style={{ height: '56px' }}>
            {projectA && (
              <div
                className="absolute h-5 rounded-full top-0 flex items-center px-2"
                style={barStyle(projectA.startDate, projectA.endDate, '#5E6AD2')}
              >
                <span className="text-[10px] font-semibold text-white truncate">{formatDate(projectA.startDate)}</span>
              </div>
            )}
            {projectB && (
              <div
                className="absolute h-5 rounded-full bottom-0 flex items-center px-2"
                style={barStyle(projectB.startDate, projectB.endDate, '#9CA3AF')}
              >
                <span className="text-[10px] font-semibold text-white truncate">{formatDate(projectB.startDate)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">{hasTimeline ? formatDate(minDate.toISOString()) : '—'}</span>
            <span className="text-[12px] font-medium text-[#DC2626] dark:text-[#FCA5A5]">
              {conflict.overlapDays} days overlap
            </span>
            <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">{hasTimeline ? formatDate(maxDate.toISOString()) : '—'}</span>
          </div>
        </div>
      </Card>

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

      <Card className="p-5">
        <SectionLabel>Resolution actions</SectionLabel>

        {resolveError && (
          <p className="text-[13px] text-[#DC2626] dark:text-[#F87171] mb-3">{resolveError}</p>
        )}

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

        {!canAct && !actionDone && (
          <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280]">
            This conflict has already been {resolutionStatus === 'resolved' ? 'resolved' : 'actioned'}. No further action required.
          </p>
        )}

        {canAct && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 px-4 py-3 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] border border-[#C7D2FE] dark:border-[#252870]">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-[13px] text-[#4338CA] dark:text-[#818CF8]">
                <span className="font-semibold">System recommends: </span>
                Approve <span className="font-semibold">{keep.dept}</span> project (higher MCDM {keep.score}) and reject <span className="font-semibold">{defer.dept}</span> project (MCDM {defer.score}).
              </p>
            </div>

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

            {activeOption && (
              <div className="flex flex-col gap-3 p-4 rounded-[8px] bg-[#FFFBEB] dark:bg-[#181305] border border-[#FDE68A] dark:border-[#3F2D05]">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideOn}
                    onChange={e => setOverrideOn(e.target.checked)}
                    className="w-3.5 h-3.5 mt-0.5 accent-[#D97706] cursor-pointer"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Record as an override
                    </span>
                    <span className="block text-[12px] text-[#92400E] dark:text-[#FACC15] mt-0.5">
                      Tick this when the decision departs from the MCDM recommendation above.
                      The audit entry is flagged OVERRIDE and keeps the justification.
                    </span>
                  </span>
                </label>

                {overrideOn && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="override-category" className="block text-[12px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1">
                        Override category
                      </label>
                      <input
                        id="override-category"
                        type="text"
                        value={overrideCategory}
                        onChange={e => setOverrideCategory(e.target.value)}
                        placeholder="e.g. Emergency works, Ministerial directive, Public safety"
                        className="w-full h-9 px-3 text-[13px] rounded-[6px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#D97706] focus:ring-2 focus:ring-[#D97706]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label htmlFor="override-reason" className="block text-[12px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1">
                        Override reason
                      </label>
                      <textarea
                        id="override-reason"
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="Why the MCDM recommendation is being set aside..."
                        rows={2}
                        className="w-full px-3 py-2 text-[13px] rounded-[6px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#D97706] focus:ring-2 focus:ring-[#D97706]/10 resize-none transition-all"
                      />
                    </div>
                    <div>
                      <label htmlFor="override-ref" className="block text-[12px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1">
                        Reference <span className="font-normal text-[#9CA3AF]">(optional)</span>
                      </label>
                      <input
                        id="override-ref"
                        type="text"
                        value={overrideRef}
                        onChange={e => setOverrideRef(e.target.value)}
                        placeholder="File, minute or order number backing this decision"
                        className="w-full h-9 px-3 text-[13px] rounded-[6px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#D97706] focus:ring-2 focus:ring-[#D97706]/10 transition-all"
                      />
                    </div>
                    {overrideIncomplete && (
                      <p className="text-[12px] text-[#B45309] dark:text-[#FACC15]">
                        A category and a reason are both required to record an override.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

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
                    disabled={!coordNote.trim() || overrideIncomplete}
                    className="px-5 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Confirm — Approve Both
                  </button>
                </div>
              </div>
            )}

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
                    disabled={!rejectReason.trim() || overrideIncomplete}
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