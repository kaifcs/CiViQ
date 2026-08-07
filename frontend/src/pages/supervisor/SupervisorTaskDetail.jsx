// One supervised project, and the only caller of PUT /api/projects/:id/progress.
// The endpoint is supervisor-only and ownership-scoped, and reaching 100% is what
// makes the backend complete the project and notify the owning officer.

import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProject } from '../../hooks/useResources'
import { useAuth } from '../../hooks/useAuth'
import { useMutation } from '../../hooks/useApi'
import { projectsApi } from '../../services'
import AsyncState from '../../components/AsyncState'
import { formatDateLong, PROJECT_STATUS_LABELS, canRecordProgress } from '../../components/dashboard'
import { PROJECT_STATUS_CONFIG } from '../../components/uiStyles'

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
      <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] flex-shrink-0 w-32">{label}</span>
      <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] font-medium text-right">{value || '—'}</span>
    </div>
  )
}

export default function SupervisorTaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { deptMap } = useAuth()
  const { data: project, loading, error, reload, setData } = useProject(id)

  // Re-seeded during render when a different project loads, rather than from an
  // effect that would commit an extra render each time.
  const [value, setValue] = useState(0)
  const [seededFor, setSeededFor] = useState(null)
  if (project && project.id !== seededFor) {
    setSeededFor(project.id)
    setValue(project.progress ?? 0)
  }

  const save = useMutation(
    useCallback((next) => projectsApi.updateProgress(id, next, deptMap), [id, deptMap])
  )

  const submit = useCallback(async (next) => {
    const result = await save.run(next)
    if (!result.ok) return

    // Merge only the updated fields, to preserve populated relationships the
    // progress response omits.
    setData((current) => ({
      ...current,
      progress: result.data.progress,
      status: result.data.status,
      _raw: { ...current._raw, actualEndDate: result.data._raw?.actualEndDate },
    }))
    setValue(result.data.progress ?? next)
  }, [save, setData])

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading task...">{null}</AsyncState>
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] text-[#6B7280] dark:text-[#9CA3AF]">Task not found, or it is not assigned to you.</p>
        <button onClick={() => navigate('/supervisor/tasks')} className="mt-3 text-[13px] text-[#5E6AD2]">Back to tasks</button>
      </div>
    )
  }

  const statusCfg = PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.pending
  const isComplete = project.status === 'completed'
  // The backend refuses progress on anything not approved or active, so the
  // control is withheld rather than offered and then rejected.
  const recordable = canRecordProgress(project)
  const current = project.progress ?? 0
  const dirty = value !== current
  const completedOn = project._raw?.actualEndDate

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>

      <button onClick={() => navigate('/supervisor/tasks')}
        className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to tasks
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">{project.title}</h1>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
            {project.projectId} · {project.type} · {project.ward || 'No ward'}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
          {PROJECT_STATUS_LABELS[project.status] || project.status}
        </span>
      </div>

      {/* The only write on this screen. */}
      <Card>
        <SectionLabel>Progress</SectionLabel>

        <div className="flex items-end justify-between gap-4 mb-3">
          <p className="text-[36px] font-bold leading-none" style={{ color: current > 0 ? '#5E6AD2' : '#9CA3AF' }}>
            {current}<span className="text-[20px]">%</span>
          </p>
          {isComplete && completedOn && (
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
              Completed {formatDateLong(completedOn)}
            </p>
          )}
        </div>

        <div className="h-[6px] rounded-full bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden mb-5">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${current}%`, background: current > 0 ? '#5E6AD2' : 'transparent' }} />
        </div>

        {isComplete ? (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-[8px] bg-[#F0FDF4] dark:bg-[#0D1F14] border border-[#BBF7D0] dark:border-[#14532D]">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#16A34A] dark:text-[#4ADE80] flex-shrink-0 mt-0.5"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className="text-[13px] text-[#15803D] dark:text-[#4ADE80]">
              This project is complete. The owning officer has been notified.
            </p>
          </div>
        ) : !recordable ? (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-[8px] bg-[#FFFBEB] dark:bg-[#1F1705] border border-[#FDE68A] dark:border-[#78350F]">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" className="text-[#B45309] dark:text-[#FBBF24] flex-shrink-0 mt-0.5"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-[13px] text-[#92400E] dark:text-[#FBBF24]">
              {project.status === 'rescheduled'
                ? 'This project has been rescheduled and is waiting on the owning officer to confirm a new start date. Progress cannot be recorded until it is approved again.'
                : project.status === 'rejected'
                  ? 'This project was rejected, so no progress can be recorded against it.'
                  : 'Progress cannot be recorded until an administrator approves this project.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                disabled={save.saving}
                aria-label="Completion percentage"
                className="flex-1 accent-[#5E6AD2] cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-[15px] font-semibold tabular-nums text-[#0F172A] dark:text-[#F8FAFC] w-[52px] text-right">
                {value}%
              </span>
            </div>

            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <button
                onClick={() => submit(value)}
                disabled={!dirty || save.saving}
                className="h-9 px-4 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {save.saving ? 'Saving...' : 'Save progress'}
              </button>

              <button
                onClick={() => submit(100)}
                disabled={save.saving}
                className="h-9 px-4 text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Mark 100% complete
              </button>

              {dirty && !save.saving && (
                <button
                  onClick={() => setValue(current)}
                  className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-3">
              Reaching 100% marks the project completed and notifies the owning officer.
            </p>
          </>
        )}

        {save.error && (
          <div className="flex items-start gap-2 mt-4">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] flex-shrink-0 mt-0.5"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {/* The backend's own message, so a rejection reads as the API stated it. */}
            <p className="text-[12px] text-[#DC2626] dark:text-[#F87171]">{save.error.message}</p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <SectionLabel>Assignment</SectionLabel>
          <InfoRow label="Officer" value={project.officerName} />
          <InfoRow label="Department" value={project.departmentFull || project.department} />
          <InfoRow label="Priority" value={project.priority} />
          <InfoRow label="MCDM score" value={project.mcdmScore === null ? null : `${project.mcdmScore}/100`} />
        </Card>

        <Card>
          <SectionLabel>Schedule &amp; location</SectionLabel>
          <InfoRow label="Start" value={project.startDate ? formatDateLong(project.startDate) : null} />
          <InfoRow label="Deadline" value={project.endDate ? formatDateLong(project.endDate) : null} />
          <InfoRow label="Ward" value={project.ward} />
          <InfoRow label="Address" value={project.address} />
        </Card>
      </div>

      {project.description && (
        <Card>
          <SectionLabel>Description</SectionLabel>
          <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">{project.description}</p>
        </Card>
      )}
    </div>
  )
}
