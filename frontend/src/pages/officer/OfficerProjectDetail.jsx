// Single project owned by this officer, with its clash history.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProject, useConflicts, useAssignableSupervisors } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { projectsApi, normaliseError } from '../../services'
import { formatDateLong, MCDM_CRITERIA, criterionWidth, isTerminalProject, UNMEASURED_CRITERION_NOTE } from '../../components/dashboard'
import { deptStyle, PROJECT_STATUS_CONFIG, TYPE_STYLES } from '../../components/uiStyles'
import { LocationMap } from '../../gis'

function formatCurrency(n) {
  if (!n) return '—'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
  return `₹${(n / 100000).toFixed(2)} L`
}

// `key` matches the mcdmBreakdown field the engine writes for each criterion,
// so each bar shows its own score rather than the overall total.


function Card({ children, className = '' }) {
  return <div className={`bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] ${className}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>{children}</div>
}
function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">{children}</p>
}
function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
      <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] w-40 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right">{value || '—'}</span>
    </div>
  )
}

export default function OfficerProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: project, loading, error, reload } = useProject(id)
  const { data: conflicts } = useConflicts()
  const { supervisors } = useAssignableSupervisors()
  const [supervisorId, setSupervisorId] = useState('')
  const [seededFor, setSeededFor] = useState(null)
  if (project && project.id !== seededFor) {
    setSeededFor(project.id)
    setSupervisorId(project.supervisorId || '')
  }
  const [supervisorSaved, setSupervisorSaved] = useState(false)
  const [assignError, setAssignError] = useState('')

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading project..." >{null}</AsyncState>
  }

  if (!project) {
    return <div className="flex flex-col items-center justify-center h-64"><p className="text-[15px] text-[#6B7280]">Project not found</p><button onClick={() => navigate('/officer/projects')} className="mt-3 text-[13px] text-[#5E6AD2]">← Back</button></div>
  }

  const clash = (conflicts || []).find(c => (c.projectAId === project.id || c.projectBId === project.id) && c.status === 'unresolved')
  const pendingConflict = (conflicts || []).find(c => (c.projectAId === project.id || c.projectBId === project.id) && c.status === 'pending_response')
  const status = PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.pending
  const scoreColor = project.mcdmScore >= 75 ? '#16A34A' : project.mcdmScore >= 60 ? '#D97706' : '#DC2626'

  // PUT /api/projects/:id — persists the supervisor assignment.
  async function handleAssignSupervisor() {
    setAssignError('')
    try {
      await projectsApi.update(id, { supervisor: supervisorId })
      setSupervisorSaved(true)
    } catch (err) {
      // The select stays open so the officer can retry, with the reason shown:
      // the backend refuses the write outright on finished work.
      setAssignError(normaliseError(err).message)
    }
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>
      <button onClick={() => navigate('/officer/projects')} className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Projects
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2.5">
            <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${deptStyle(project.department)}`}>{project.department}</span>
            <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[project.type] || ''}`}>{project.type}</span>
            <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${status.bg} ${status.color}`}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.dot }} />
              {status.text}
            </span>
            {project.hasClash && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B91C1C] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#1F0A0A] px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }} />
                Clash detected
              </span>
            )}
          </div>
          <h1 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">{project.title}</h1>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">{project.departmentFull}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          {project.status === 'pending' && (
            <button onClick={() => navigate(`/officer/projects/${project.id}/edit`)}
              className="h-9 px-4 text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
              Edit project
            </button>
          )}
          {pendingConflict && (
            <button onClick={() => navigate(`/officer/projects/${project.id}/respond`)}
              className="h-9 px-4 text-[13px] font-medium text-white bg-[#DC2626] rounded-[6px] hover:bg-[#B91C1C] transition-colors flex items-center gap-2">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Respond to rejection
            </button>
          )}
        </div>
      </div>

      {clash && (
        <div onClick={() => navigate(`/officer/conflicts/${clash.id}`)}
          className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-[#FEF2F2] dark:bg-[#1F0A0A] border border-[#FECACA] dark:border-[#7F1D1D] cursor-pointer hover:border-[#DC2626]/60 transition-colors">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#B91C1C] dark:text-[#F87171]">Clash detected with another project</p>
            <p className="text-[12px] text-[#B91C1C]/80 dark:text-[#F87171]/70 truncate mt-0.5">{clash.overlapDescription}</p>
          </div>
          <span className="text-[12px] text-[#DC2626] font-medium flex items-center gap-1">View conflict <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
      )}

      {project.status === 'rejected' && project.rejectionReason && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[8px] bg-[#FFFBEB] dark:bg-[#181305] border border-[#FCD34D] dark:border-[#854F0B]">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#D97706] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#92400E] dark:text-[#FACC15]">Project rejected by admin</p>
            <p className="text-[12px] text-[#92400E]/80 dark:text-[#FACC15]/80 mt-0.5">{project.rejectionReason}</p>
            {project.suggestedDate && <p className="text-[12px] font-medium text-[#92400E] dark:text-[#FACC15] mt-1">Suggested start date: {formatDateLong(project.suggestedDate)}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <Card className="p-5">
          <SectionLabel>MCDM priority score</SectionLabel>
          <div className="flex items-end gap-4 mb-5 pb-5 border-b border-[#F3F4F6] dark:border-[#27272A]">
            <span className="text-[56px] font-bold leading-none" style={{ color: scoreColor }}>{project.mcdmScore}</span>
            <div className="flex flex-col pb-1 gap-0.5">
              <span className="text-[16px] font-medium text-[#9CA3AF] dark:text-[#6B7280]">/ 100</span>
              <span className="text-[12px] font-medium" style={{ color: scoreColor }}>{project.mcdmScore >= 75 ? 'High priority' : project.mcdmScore >= 60 ? 'Medium priority' : 'Low priority'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {MCDM_CRITERIA.map(c => (
              <div key={c.label}>
                <div className="flex items-center justify-between mb-1.5" title={c.measured === false ? UNMEASURED_CRITERION_NOTE : undefined}>
                  <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{c.label}</span>
                  <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280]">
                    {c.measured === false ? `${c.weight}% · not measured` : `${c.weight}%`}
                  </span>
                </div>
                <div className="h-[5px] bg-[#F3F4F6] dark:bg-[#27272A] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#5E6AD2]" style={{ width: criterionWidth(project.mcdmBreakdown, c.key), transition: 'width 0.4s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 flex flex-col">
          <SectionLabel>Location</SectionLabel>
          <div className="flex-1 flex flex-col gap-2">
            <LocationMap
              height="200px"
              points={[{ coord: { lat: project.centerLat, lng: project.centerLng }, label: project.title }]}
              geoJSON={project._raw?.location?.geoJSON}
              emptyMessage="No coordinates recorded for this project."
            />
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{project.ward}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">{project.address}</p>
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
            <InfoRow label="Submission date" value={formatDateLong(project.submittedAt)} />
            <InfoRow label="Start date"      value={formatDateLong(project.startDate)} />
            <InfoRow label="End date"        value={formatDateLong(project.endDate)} />
            <InfoRow label="Estimated cost"  value={formatCurrency(project.estimatedCost)} />
            <InfoRow label="Budget source"   value={project.budgetSource} />
          </div>
          <div>
            <InfoRow label="Tender number" value={project.tenderNumber} />
            <InfoRow label="Contractor"    value={project.contractorName ? `${project.contractorName} · ${project.contractorFirm}` : '—'} />
            <InfoRow label="Ward"          value={project.ward} />
            <InfoRow label="Zone"          value={project.zone} />
            <div className="flex items-start justify-between py-2.5 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
              <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] w-40 flex-shrink-0">Supervisor</span>
              <div className="flex items-center gap-2">
                {supervisorSaved ? (
                  <span className="text-[13px] font-medium text-[#16A34A] dark:text-[#4ADE80]">
                    ✓ {supervisors.find(s => s.id === supervisorId)?.name || 'Assigned'}
                  </span>
                ) : isTerminalProject(project) ? (
                  // Finished work is read-only on the backend, so the control is
                  // withheld rather than offered and then refused.
                  <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] text-right">
                    {project.supervisorName || '—'}
                  </span>
                ) : supervisors.length === 0 ? (
                  <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] text-right max-w-[220px]">
                    {project.supervisorName
                      ? project.supervisorName
                      : 'No supervisor available to assign — ask an administrator to assign one.'}
                  </span>
                ) : (
                  <>
                    <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)}
                      style={{ paddingRight: '24px' }}
                      className="h-8 pl-2 text-[12px] rounded-[6px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] cursor-pointer">
                      <option value="">Not assigned</option>
                      {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {supervisorId && (
                      <button onClick={handleAssignSupervisor}
                        className="h-8 px-2.5 text-[12px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
                        Assign
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {assignError && (
              <p className="text-[12px] text-[#DC2626] dark:text-[#F87171] text-right pt-1">{assignError}</p>
            )}
          </div>
        </div>
      </Card>

      {/* The audit trail is administrator-only. */}
      <Card className="p-5">
        <SectionLabel>Audit trail</SectionLabel>
        <p className="text-[13px] text-[#9CA3AF] dark:text-[#6B7280] text-center py-4">
          The audit trail is available to administrators. Actions on this project are recorded.
        </p>
      </Card>

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
