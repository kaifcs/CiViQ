// Conflict detail from the officer's side.
//
// The opposing project may arrive as a bare id when this officer is not
// authorised to see it; the adapters render that as details-unavailable rather
// than hiding the conflict.

import { useNavigate, useParams } from 'react-router-dom'
import { useConflict, useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { CONFLICT_STATUS_CONFIG, DEPT_STYLES, SEVERITY_CONFIG, TYPE_STYLES, scoreColor } from '../../components/uiStyles'
import { formatDate, formatDateLong, daysSince, MCDM_CRITERIA, criterionWidth } from '../../components/dashboard'



function Card({ children, className = '' }) { return <div className={`bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] ${className}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>{children}</div> }
function SL({ children }) { return <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">{children}</p> }
function InfoRow({ label, value }) {
  return <div className="flex items-start justify-between py-2 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0"><span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{label}</span><span className="text-[12px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right ml-4">{value || '—'}</span></div>
}

// `score` and `breakdown` are passed in rather than derived from `isHigher`:
// the higher-scoring side is whichever the backend would keep, not necessarily
// project1.
function ProjectPanel({ project, score, breakdown, isHigher }) {
  if (!project) return null
  return (
    <Card className="p-5 flex flex-col gap-4 flex-1">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full ${isHigher ? 'bg-[#EEF2FF] dark:bg-[#131629] text-[#4338CA] dark:text-[#818CF8]' : 'bg-[#F8FAFC] dark:bg-[#1A1F2B] text-[#6B7280] dark:text-[#9CA3AF]'}`}>
          {isHigher ? '★ Higher Priority' : 'Lower Priority'}
        </span>
        <span className="text-[24px] font-bold leading-none" style={{ color: scoreColor(score) }}>{score}</span>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug mb-2">{project.title}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${DEPT_STYLES[project.department] || ''}`}>{project.department}</span>
          <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[project.type] || ''}`}>{project.type}</span>
        </div>
      </div>
      <div>
        <InfoRow label="Start date" value={formatDateLong(project.startDate)} />
        <InfoRow label="End date"   value={formatDateLong(project.endDate)} />
        <InfoRow label="Officer"    value={project.officerName} />
        <InfoRow label="Ward"       value={project.ward} />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-3">MCDM breakdown</p>
        <div className="flex flex-col gap-2.5">
          {MCDM_CRITERIA.map(c => (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">{c.label}</span>
                <span className="text-[10px] font-semibold text-[#9CA3AF]">{c.weight}%</span>
              </div>
              <div className="h-[4px] bg-[#F3F4F6] dark:bg-[#27272A] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: criterionWidth(breakdown, c.key), backgroundColor: isHigher ? '#5E6AD2' : '#9CA3AF', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

export default function OfficerConflictDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: conflict, loading, error, reload } = useConflict(id)
  const { data: projects } = useProjects()

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading conflict..." >{null}</AsyncState>
  }

  if (!conflict) {
    return <div className="flex flex-col items-center justify-center h-64"><p className="text-[15px] text-[#6B7280]">Conflict not found</p><button onClick={() => navigate('/officer/conflicts')} className="mt-3 text-[13px] text-[#5E6AD2]">← Back</button></div>
  }

  const projectA = (projects || []).find(p => p.id === conflict.projectAId)
  const projectB = (projects || []).find(p => p.id === conflict.projectBId)

  // The deferred side is whichever scores lower, not necessarily project1; the
  // adapter resolves that using the backend's own rule.
  const aIsHigher = conflict.higherPriorityId === conflict.projectAId
  const keep = aIsHigher
    ? { project: projectA, dept: conflict.projectADept, score: conflict.projectAScore, breakdown: conflict.projectABreakdown }
    : { project: projectB, dept: conflict.projectBDept, score: conflict.projectBScore, breakdown: conflict.projectBBreakdown }
  const defer = aIsHigher
    ? { project: projectB, dept: conflict.projectBDept, score: conflict.projectBScore, breakdown: conflict.projectBBreakdown }
    : { project: projectA, dept: conflict.projectADept, score: conflict.projectAScore, breakdown: conflict.projectABreakdown }

  const days     = daysSince(conflict.detectedAt)
  const status   = CONFLICT_STATUS_CONFIG[conflict.status] || CONFLICT_STATUS_CONFIG.unresolved
  const severity = SEVERITY_CONFIG[conflict.severity] || SEVERITY_CONFIG.low

  const allDates = [projectA?.startDate, projectA?.endDate, projectB?.startDate, projectB?.endDate].filter(Boolean).map(d => new Date(d))
  // A clashing project the viewer cannot see leaves allDates empty; Math.min
  // would then yield Infinity and toISOString() would throw.
  const hasTimeline = allDates.length > 0
  const minDate  = hasTimeline ? new Date(Math.min(...allDates)) : null
  const maxDate  = hasTimeline ? new Date(Math.max(...allDates)) : null
  const totalMs  = maxDate - minDate
  function barStyle(start, end, color) {
    const left  = ((new Date(start) - minDate) / totalMs) * 100
    const width = ((new Date(end) - new Date(start)) / totalMs) * 100
    return { left: `${left}%`, width: `${width}%`, backgroundColor: color }
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Back */}
      <button onClick={() => navigate('/officer/conflicts')} className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Conflicts
      </button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${severity.bg} ${severity.color}`}>{severity.text}</span>
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.dot }} />{status.text}
          </span>
          <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">Detected {days}d ago</span>
        </div>
        <h1 className="text-[20px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">{conflict.projectADept} ↔ {conflict.projectBDept} Clash</h1>
        <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{conflict.overlapDescription}</p>
      </div>

      {/* View-only notice */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] border border-[#C7D2FE] dark:border-[#252870]">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p className="text-[13px] text-[#4338CA] dark:text-[#818CF8]">View only. Clash resolution is handled by the Admin. You will be notified when a decision is made.</p>
      </div>

      {/* System recommendation */}
      <Card className="p-5">
        <SL>System recommendation</SL>
        <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">
          Approve <span className="font-semibold">{keep.dept}</span> project (MCDM {keep.score}) and defer <span className="font-semibold">{defer.dept}</span> project (MCDM {defer.score}).
        </p>
      </Card>

      {/* Two project panels */}
      <div className="grid grid-cols-2 gap-4">
        <ProjectPanel project={keep.project}  score={keep.score}  breakdown={keep.breakdown}  isHigher={true}  />
        <ProjectPanel project={defer.project} score={defer.score} breakdown={defer.breakdown} isHigher={false} />
      </div>

      {/* Map placeholder */}
      <Card className="p-5">
        <SL>Overlap location</SL>
        <div className="rounded-[8px] flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]" style={{ height: '160px' }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mb-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280]">{conflict.overlapDescription}</p>
          <p className="text-[11px] text-[#D1D5DB] dark:text-[#374151] mt-2">Interactive map in Phase 3</p>
        </div>
      </Card>

      {/* Timeline */}
      <Card className="p-5">
        <SL>Timeline overlap</SL>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#5E6AD2]" /><span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{conflict.projectADept} — {projectA?.title?.split('—')[0]?.trim()}</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#9CA3AF]" /><span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{conflict.projectBDept} — {projectB?.title?.split('—')[0]?.trim()}</span></div>
          </div>
          <div className="relative" style={{ height: '56px' }}>
            {projectA && <div className="absolute h-5 rounded-full top-0 flex items-center px-2" style={barStyle(projectA.startDate, projectA.endDate, '#5E6AD2')}><span className="text-[10px] font-semibold text-white truncate">{formatDate(projectA.startDate)}</span></div>}
            {projectB && <div className="absolute h-5 rounded-full bottom-0 flex items-center px-2" style={barStyle(projectB.startDate, projectB.endDate, '#9CA3AF')}><span className="text-[10px] font-semibold text-white truncate">{formatDate(projectB.startDate)}</span></div>}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">{hasTimeline ? formatDate(minDate.toISOString()) : '—'}</span>
            <span className="text-[12px] font-medium text-[#DC2626] dark:text-[#FCA5A5]">{conflict.overlapDays} days overlap</span>
            <span className="text-[11px] text-[#9CA3AF]">{hasTimeline ? formatDate(maxDate.toISOString()) : '—'}</span>
          </div>
        </div>
      </Card>

      {/* Resolution history */}
      {conflict.adminNote && (
        <Card className="p-5">
          <SL>Resolution history</SL>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold bg-[#EEF2FF] dark:bg-[#1E2260] text-[#5E6AD2] dark:text-[#9BA3F0] border border-[#E0E7FF] dark:border-[#252870]">RK</div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{conflict.resolution?.resolvedBy || 'Admin'} <span className="font-normal text-[#6B7280] dark:text-[#9CA3AF]">· {conflict.resolution?.type === 'approve_both' ? 'Approved both' : 'Rejected lower priority'}</span></p>
              <p className="text-[12px] text-[#9CA3AF] mt-0.5">{formatDateLong(conflict.resolution?.resolvedAt)}</p>
              <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] mt-2 leading-relaxed">{conflict.adminNote}</p>
              {conflict.resolution?.suggestedDate && <p className="text-[12px] text-[#6B7280] mt-1">Suggested date: <span className="font-medium">{formatDateLong(conflict.resolution.suggestedDate)}</span></p>}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}