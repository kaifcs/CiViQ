// Officer's response to an administrator's reschedule decision.
//
// Accepting takes the suggested date; countering proposes another, which the
// backend re-checks for clashes before recording whether it is actually clear.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConflicts, useProject, useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { conflictsApi } from '../../services'
import { formatDateLong } from '../../components/dashboard'

export default function OfficerClashRespond() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: project, loading, error, reload } = useProject(id)
  const { data: conflicts } = useConflicts()
  const { data: allProjects } = useProjects()
  const conflict = (conflicts || []).find((entry) => (entry.projectAId === id || entry.projectBId === id) && entry.status === 'pending_response')

  const [customDate, setCustomDate] = useState('')
  const [dateError, setDateError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [acceptedSuggested, setAcceptedSuggested] = useState(false)
  const [recheckResult, setRecheckResult] = useState(null)

  if (loading || error) {
    return <AsyncState loading={loading} error={error} onRetry={reload} label="Loading..." >{null}</AsyncState>
  }

  if (!project || !conflict) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] text-[#6B7280] dark:text-[#9CA3AF]">No pending clash response found for this project.</p>
        <button onClick={() => navigate(`/officer/projects/${id}`)} className="mt-3 text-[13px] text-[#5E6AD2]">Back to project</button>
      </div>
    )
  }

  const suggestedDate = conflict.resolution?.suggestedDate || conflict.suggestedDate || null
  const otherId = conflict.projectAId === id ? conflict.projectBId : conflict.projectAId
  const higherProject = (allProjects || []).find((entry) => entry.id === otherId)

  // PUT /api/conflicts/:id/respond — the backend re-runs clash detection.
  async function handleAcceptSuggested() {
    try {
      const res = await conflictsApi.respond(conflict.id, 'accept')
      setAcceptedSuggested(true)
      setRecheckResult(res.recheckPassed ? 'clean' : 'clash')
      setSubmitted(true)
    } catch (err) {
      setDateError(err?.response?.data?.message || 'Could not submit your response.')
    }
  }

  async function handleCustomDate() {
    if (!customDate) {
      setDateError('Please select a date.')
      return
    }

    if (new Date(customDate) < new Date(suggestedDate)) {
      setDateError(`Date cannot be earlier than the suggested date (${formatDateLong(suggestedDate)}). This is enforced by the system.`)
      return
    }

    setDateError('')
    try {
      const res = await conflictsApi.respond(conflict.id, 'custom', customDate)
      setRecheckResult(res.recheckPassed ? 'clean' : 'clash')
      setSubmitted(true)
    } catch (err) {
      setDateError(err?.response?.data?.message || 'Could not submit your response.')
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${recheckResult === 'clean' ? 'bg-[#F0FDF4] dark:bg-[#0D1F14]' : 'bg-[#FEF2F2] dark:bg-[#1F0A0A]'}`}>
          {recheckResult === 'clean' ? (
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#16A34A] dark:text-[#4ADE80]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#DC2626]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          )}
        </div>
        {recheckResult === 'clean' ? (
          <div>
            <h2 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-2">Response submitted successfully</h2>
            <p className="text-[14px] text-[#6B7280] dark:text-[#9CA3AF]">New start date: <span className="font-semibold">{acceptedSuggested ? formatDateLong(suggestedDate) : formatDateLong(customDate)}</span></p>
            <p className="text-[13px] text-[#16A34A] dark:text-[#4ADE80] mt-2">No clashes detected with the new date. Admin will review and approve.</p>
          </div>
        ) : (
          <div>
            <h2 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-2">New clash detected</h2>
            {/* Same source as the success branch: on the accept path customDate
                is never set, so reading it alone rendered "(—)". */}
            <p className="text-[14px] text-[#6B7280] dark:text-[#9CA3AF]">
              {acceptedSuggested ? 'The suggested date' : 'Your proposed date'}
              {' ('}{acceptedSuggested ? formatDateLong(suggestedDate) : formatDateLong(customDate)}{') '}
              clashes with another project.
            </p>
            <p className="text-[13px] text-[#DC2626] dark:text-[#F87171] mt-2">Admin will review and suggest a new date.</p>
          </div>
        )}
        <button onClick={() => navigate(`/officer/projects/${id}`)} className="px-6 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
          Back to project
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>
      <button onClick={() => navigate(`/officer/projects/${id}`)} className="flex items-center gap-1.5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors w-fit">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to project
      </button>

      <div>
        <h1 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">Respond to rejection</h1>
        <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">Choose a new start date for your project to resolve the clash.</p>
      </div>

      <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">Rejection summary</p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mb-1">Rejected project</p>
            <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{project.title}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">MCDM: {project.mcdmScore}</p>
          </div>
          <div>
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mb-1">Higher priority project</p>
            <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{higherProject?.title || '-'}</p>
            <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">MCDM: {conflict.projectAId === id ? conflict.projectBScore : conflict.projectAScore}</p>
          </div>
        </div>
        {conflict.adminNote && (
          <div className="mt-4 pt-4 border-t border-[#F3F4F6] dark:border-[#27272A]">
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mb-1">Admin rejection reason</p>
            <p className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">{conflict.adminNote}</p>
          </div>
        )}
      </div>

      <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">System suggested date</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[28px] font-bold text-[#5E6AD2] dark:text-[#818CF8]">{formatDateLong(suggestedDate)}</p>
            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
              Calculated as: higher priority project end date + buffer days. This is the <span className="font-semibold">minimum allowed start date</span>.
            </p>
          </div>
          <button onClick={handleAcceptSuggested} className="flex-shrink-0 h-10 px-5 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
            Accept suggested date
          </button>
        </div>
      </div>

      <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[8px] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em] mb-4">Propose a custom date</p>
        <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF] mb-4">
          You can propose a later date if your team needs more time. The date must be on or after <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{formatDateLong(suggestedDate)}</span>.
        </p>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <input
              type="date"
              value={customDate}
              onChange={(event) => {
                setCustomDate(event.target.value)
                setDateError('')
              }}
              min={suggestedDate}
              className="w-full h-10 px-3 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
            />
            {dateError && (
              <div className="flex items-start gap-2 mt-2">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" className="text-[#DC2626] flex-shrink-0 mt-0.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p className="text-[12px] text-[#DC2626] dark:text-[#F87171]">{dateError}</p>
              </div>
            )}
          </div>
          <button onClick={handleCustomDate} className="flex-shrink-0 h-10 px-5 text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
            Propose this date
          </button>
        </div>
      </div>
    </div>
  )
}
