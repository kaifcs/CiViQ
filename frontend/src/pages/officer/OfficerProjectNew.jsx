// Project submission wizard for creating and editing projects.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useAssignableSupervisors, useDepartments, useProject } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import { projectsApi, buildProjectPayload, normaliseError } from '../../services'
// Configuration only.
import { DEFAULT_CENTER } from '../../gis/config'
import { isValidLatitude, isValidLongitude } from '../../gis/coordinates'
import { inputCls, labelCls } from '../../components/uiStyles'

const STEPS = ['Phase', 'Identity', 'Location', 'Timeline', 'Budget', 'MCDM', 'Team']

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8 flex-shrink-0">
      {STEPS.map((s, i) => {
        const done    = i < current
        const active  = i === current
        const isLast  = i === STEPS.length - 1
        return (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                done   ? 'border-[#5E6AD2] bg-[#5E6AD2] text-white' :
                active ? 'border-[#5E6AD2] bg-white dark:bg-[#1C1C1F] text-[#5E6AD2]' :
                         'border-[#E5E5E5] dark:border-[#27272A] bg-white dark:bg-[#1C1C1F] text-[#9CA3AF]'
              }`}>
                {done ? <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active ? 'text-[#5E6AD2]' : done ? 'text-[#6B7280] dark:text-[#9CA3AF]' : 'text-[#D1D5DB] dark:text-[#374151]'}`}>{s}</span>
            </div>
            {!isLast && <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-[#5E6AD2]' : 'bg-[#E5E5E5] dark:bg-[#27272A]'}`} />}
          </div>
        )
      })}
    </div>
  )
}

const hintCls  = "text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1"

function RadioGroup({ label, name, options, value, onChange }) {
  return (
    <div>
      <p className={labelCls}>{label}</p>
      <div className="flex flex-col gap-2 mt-1">
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2.5 cursor-pointer">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}
              className="w-4 h-4 accent-[#5E6AD2]" />
            <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function CheckGroup({ label, options, values, onChange }) {
  function toggle(val) {
    if (values.includes(val)) onChange(values.filter(v => v !== val))
    else onChange([...values, val])
  }
  return (
    <div>
      <p className={labelCls}>{label}</p>
      <div className="flex flex-col gap-2 mt-1">
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)}
              className="w-4 h-4 accent-[#5E6AD2] rounded" />
            <span className="text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// `<input type="date">` needs YYYY-MM-DD; the API returns an ISO timestamp.
function toDateInput(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

// Backend `phase` enum -> the wizard's own vocabulary. adaptProject already
// folds `phase1` into `phased`.
const PHASE_TO_FORM = { standalone: 'standalone', phased: 'phased', phase1: 'phased', continuation: 'continue' }

export default function OfficerProjectNew() {
  const navigate = useNavigate()
  const { id } = useParams()
  // Present only on /officer/projects/:id/edit.
  const editing = Boolean(id)
  const { user, deptMap } = useAuth()
  // `skip` when there is no id, so the create route issues no request.
  const { data: existing, loading: loadingExisting, error: loadError, reload } = useProject(id)
  // Derived from the officer's own projects, since GET /api/users is admin-only.
  const { supervisors } = useAssignableSupervisors()
  const { data: departments } = useDepartments()
  const [submitError, setSubmitError] = useState('')

  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [mcdmResult, setMcdmResult] = useState(null)

  const [phase,    setPhase]    = useState('standalone')
  const [title,    setTitle]    = useState('')
  const [type,     setType]     = useState('Road')
  const [desc,     setDesc]     = useState('')
  const [address,  setAddress]  = useState('')
  const [ward,     setWard]     = useState('Ward 12')
  // Project.location.centerCoords is required by the backend and is what every
  // GIS layer plots. Seeded from the configured city centre so it is never
  // submitted empty, but the officer must be able to correct it.
  const [lat,      setLat]      = useState(String(DEFAULT_CENTER.lat))
  const [lng,      setLng]      = useState(String(DEFAULT_CENTER.lng))
  const [startDate,setStartDate]= useState('')
  const [endDate,  setEndDate]  = useState('')
  const [cost,     setCost]     = useState('')
  const [budgetSrc,setBudgetSrc]= useState('Municipal Fund')
  const [tender,   setTender]   = useState('')
  const [contractor,setContractor]=useState('')
  const [firm,     setFirm]     = useState('')
  const [condition,       setCondition]       = useState('poor')
  const [incidents,       setIncidents]       = useState([])
  const [lastWorkYear,    setLastWorkYear]    = useState('')
  const [tenderStatus,    setTenderStatus]    = useState('in_process')
  const [contractorAssigned,setContractorAssigned]=useState('no')
  const [roadClosure,     setRoadClosure]     = useState('partial')
  const [utilities,       setUtilities]       = useState([])
  const [disruptionDays,  setDisruptionDays]  = useState('')
  const [supervisorId, setSupervisorId] = useState('')

  // Re-seeded during render when the project arrives, rather than from an effect
  // that would commit an extra render — the pattern the detail screens use.
  const [seededFor, setSeededFor] = useState(null)
  if (editing && existing && existing.id !== seededFor) {
    setSeededFor(existing.id)
    const m = existing._raw?.mcdmInputs || {}
    setPhase(PHASE_TO_FORM[existing.phase] || 'standalone')
    setTitle(existing.title || '')
    setType(existing.type || 'Road')
    setDesc(existing.description || '')
    setAddress(existing.address || '')
    // Kept even when it is outside the select's option list, so an edit never
    // silently relocates a project that was filed under another ward.
    if (existing.ward) setWard(existing.ward)
    if (Number.isFinite(existing.centerLat)) setLat(String(existing.centerLat))
    if (Number.isFinite(existing.centerLng)) setLng(String(existing.centerLng))
    setStartDate(toDateInput(existing.startDate))
    setEndDate(toDateInput(existing.endDate))
    setCost(existing.estimatedCost == null ? '' : String(existing.estimatedCost))
    if (existing.budgetSource) setBudgetSrc(existing.budgetSource)
    setTender(existing.tenderNumber || '')
    setContractor(existing.contractorName || '')
    setFirm(existing.contractorFirm || '')
    if (m.conditionRating) setCondition(m.conditionRating)
    setIncidents(Array.isArray(m.incidents) ? m.incidents : [])
    setLastWorkYear(m.lastWorkYear == null ? '' : String(m.lastWorkYear))
    if (m.tenderStatus) setTenderStatus(m.tenderStatus)
    setContractorAssigned(m.contractorAssigned ? 'yes' : 'no')
    if (m.roadClosure) setRoadClosure(m.roadClosure)
    setUtilities(Array.isArray(m.utilityDisruption) ? m.utilityDisruption : [])
    setDisruptionDays(m.disruptionDays == null ? '' : String(m.disruptionDays))
    setSupervisorId(existing.supervisorId || '')
  }

  const dept = (editing ? existing?.department : user?.department) || null

  function duration() {
    if (!startDate || !endDate) return ''
    const diff = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)
    return diff > 0 ? `${diff} days` : ''
  }

  function handleNext() { if (step < 6) setStep(s => s + 1) }
  function handleBack() { if (step > 0) setStep(s => s - 1) }

  const [clashCount, setClashCount] = useState(0)
  const [saving, setSaving] = useState(false)

  // Submits project create and edit requests; validation and workflow rules are enforced by the API.
  async function handleSubmit() {
    setSubmitError('')
    const departmentId = (departments || []).find(d => d.code === dept)?.id
    if (!departmentId) {
      setSubmitError(editing
        ? 'This project has no resolvable department. Contact an administrator.'
        : 'Your account has no department assigned. Contact an administrator.')
      return
    }
    // centerCoords is required by the backend; catch it here so the officer sees
    // a field-level message instead of a 400 from the API.
    if (!isValidLatitude(Number(lat)) || !isValidLongitude(Number(lng))) {
      setSubmitError('Enter a valid latitude and longitude on the Location step.')
      return
    }
    const payload = buildProjectPayload({
      title, type, description: desc, departmentId, phase,
      startDate, endDate, estimatedCost: cost, budgetSource: budgetSrc,
      tenderNumber: tender, contractorName: contractor, contractorFirm: firm,
      supervisorId, ward, address, lat, lng,
      conditionRating: condition, incidents, lastWorkYear, tenderStatus,
      contractorAssigned, roadClosure, utilities, disruptionDays,
    })
    setSaving(true)
    try {
      if (editing) {
        // PUT answers with the project alone — no mcdm envelope and no clash
        // count — so the score is read from the saved document.
        const saved = await projectsApi.update(id, payload, deptMap)
        setMcdmResult(saved?.mcdmScore ?? null)
        setClashCount(0)
      } else {
        const res = await projectsApi.create(payload, deptMap)
        setMcdmResult(res.mcdm?.outOf100 ?? res.project?.mcdmScore ?? null)
        setClashCount(res.clashesDetected || 0)
      }
      setSubmitted(true)
    } catch (err) {
      setSubmitError(normaliseError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const potentialClash = clashCount > 0

  // An edit cannot render its fields until the project it edits has loaded.
  if (editing && (loadingExisting || loadError)) {
    return <AsyncState loading={loadingExisting} error={loadError} onRetry={reload} label="Loading project...">{null}</AsyncState>
  }

  if (editing && !existing) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-[15px] text-[#6B7280] dark:text-[#9CA3AF]">Project not found, or it is not assigned to you.</p>
        <button onClick={() => navigate('/officer/projects')} className="mt-3 text-[13px] text-[#5E6AD2]">Back to projects</button>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="w-16 h-16 rounded-full bg-[#EEF2FF] dark:bg-[#131629] flex items-center justify-center">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-2">
            {editing ? 'Project updated successfully' : 'Project submitted successfully'}
          </h2>
          <p className="text-[15px] text-[#6B7280] dark:text-[#9CA3AF]">
            {editing
              ? 'Your changes have been saved and the project has been re-scored.'
              : 'Your project has been sent for admin review.'}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 p-6 rounded-[12px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]" style={{ minWidth: '280px' }}>
          <p className="text-[13px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wide">Your MCDM Priority Score</p>
          <p className="text-[56px] font-bold leading-none" style={{ color: mcdmResult >= 75 ? '#16A34A' : mcdmResult >= 60 ? '#D97706' : '#DC2626' }}>
            {mcdmResult}
          </p>
          <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">out of 100</p>
          {potentialClash && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[#FFFBEB] dark:bg-[#181305] border border-[#FCD34D] dark:border-[#854F0B] w-full">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" className="text-[#D97706] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p className="text-[12px] text-[#92400E] dark:text-[#FACC15]">{clashCount} clash{clashCount === 1 ? '' : 'es'} detected by the system. Admin will review.</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/officer/projects')}
            className="px-5 py-2 text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors">
            Back to projects
          </button>
          {editing ? (
            <button onClick={() => navigate(`/officer/projects/${id}`)}
              className="px-5 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
              View project
            </button>
          ) : (
            <button onClick={() => { setSubmitted(false); setStep(0) }}
              className="px-5 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
              Submit another
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      <StepBar current={step} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto">

          {step === 0 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">What type of submission is this?</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Select the project phase before filling in the details.</p>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { value: 'standalone', label: 'New standalone project', sub: 'A single, independent project with no planned follow-up phases.' },
                  { value: 'phased',     label: 'New phased project (Phase 1)', sub: 'First phase of a larger multi-phase plan.' },
                  { value: 'continue',   label: 'Continue existing project', sub: 'Phase 2, 3, 4... of a project already in the system.' },
                ].map(o => (
                  <div key={o.value} onClick={() => setPhase(o.value)}
                    className={`p-4 rounded-[8px] border-2 cursor-pointer transition-all ${phase === o.value ? 'border-[#5E6AD2] bg-[#EEF2FF] dark:bg-[#131629]' : 'border-[#E5E5E5] dark:border-[#27272A] hover:border-[#5E6AD2]/40'}`}>
                    <p className={`text-[14px] font-semibold ${phase === o.value ? 'text-[#4338CA] dark:text-[#818CF8]' : 'text-[#0F172A] dark:text-[#F8FAFC]'}`}>{o.label}</p>
                    <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">{o.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Basic project details</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Provide the core identity of this project.</p>
              </div>
              <div>
                <label className={labelCls}>Project title <span className="text-[#DC2626]">*</span></label>
                <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. MG Road Resurfacing Phase 2" />
              </div>
              <div>
                <label className={labelCls}>Project type <span className="text-[#DC2626]">*</span></label>
                <select value={type} onChange={e => setType(e.target.value)} style={{ paddingRight: '32px' }}
                  className={`${inputCls} cursor-pointer`}>
                  {['Road', 'Water', 'Sewage', 'Electrical', 'Parks', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Project description <span className="text-[#DC2626]">*</span></label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} placeholder="Describe the scope of work..."
                  className="w-full px-3 py-2.5 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Project location</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Set the location where this project will take place.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className={labelCls}>Address / Road name <span className="text-[#DC2626]">*</span></label>
                    <input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. MG Road, Vijay Nagar" />
                  </div>
                  <div>
                    <label className={labelCls}>Ward</label>
                    <select value={ward} onChange={e => setWard(e.target.value)} style={{ paddingRight: '32px' }} className={`${inputCls} cursor-pointer`}>
                      {['Ward 3', 'Ward 7', 'Ward 9', 'Ward 12', 'Ward 15', 'Ward 18', 'Ward 22'].map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Latitude <span className="text-[#DC2626]">*</span></label>
                      <input
                        className={inputCls}
                        value={lat}
                        onChange={e => setLat(e.target.value)}
                        inputMode="decimal"
                        placeholder="28.6692"
                      />
                      {!isValidLatitude(Number(lat)) && (
                        <p className="text-[11px] text-[#DC2626] mt-1">Enter a latitude between -90 and 90</p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Longitude <span className="text-[#DC2626]">*</span></label>
                      <input
                        className={inputCls}
                        value={lng}
                        onChange={e => setLng(e.target.value)}
                        inputMode="decimal"
                        placeholder="77.4538"
                      />
                      {!isValidLongitude(Number(lng)) && (
                        <p className="text-[11px] text-[#DC2626] mt-1">Enter a longitude between -180 and 180</p>
                      )}
                    </div>
                  </div>
                  {/* Clash detection runs server-side on submit, so nothing is
                      known about clashes at this point. */}
                  {ward && (
                    <div className="p-3 rounded-[8px] border bg-[#F8FAFC] dark:bg-[#18181B] border-[#E5E5E5] dark:border-[#27272A]">
                      <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
                        Clash detection for {ward} runs when you submit. The result is shown on the confirmation step.
                      </p>
                    </div>
                  )}
                </div>
                <div className="rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] flex flex-col items-center justify-center gap-2" style={{ minHeight: '280px' }}>
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
                  </svg>
                  <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">Interactive map — Phase 3</p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Project timeline</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Set the planned start and end dates.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Planned start date <span className="text-[#DC2626]">*</span></label>
                  <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Planned end date <span className="text-[#DC2626]">*</span></label>
                  <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              {duration() && (
                <div className="flex items-center gap-3 p-4 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] border border-[#C7D2FE] dark:border-[#252870]">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <p className="text-[13px] text-[#4338CA] dark:text-[#818CF8] font-medium">Estimated duration: {duration()}</p>
                </div>
              )}
              {startDate && [6,7,8,9].includes(new Date(startDate).getMonth() + 1) && (
                <div className="flex items-center gap-3 p-3 rounded-[8px] bg-[#FFFBEB] dark:bg-[#181305] border border-[#FCD34D] dark:border-[#854F0B]">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-[#D97706] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <p className="text-[12px] text-[#92400E] dark:text-[#FACC15]">Starting during monsoon season (Jun–Sep) will reduce your MCDM seasonal compatibility score.</p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Budget & procurement</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Financial and contractor details — informational only.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Estimated cost (₹)</label>
                  <input type="number" className={inputCls} value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 4200000" />
                </div>
                <div>
                  <label className={labelCls}>Budget source</label>
                  <select value={budgetSrc} onChange={e => setBudgetSrc(e.target.value)} style={{ paddingRight: '32px' }} className={`${inputCls} cursor-pointer`}>
                    {['Municipal Fund', 'State Grant', 'Central Scheme', 'PPP', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tender number</label>
                  <input className={inputCls} value={tender} onChange={e => setTender(e.target.value)} placeholder="e.g. PWD/GZB/2025/030" />
                </div>
                <div>
                  <label className={labelCls}>Contractor name</label>
                  <input className={inputCls} value={contractor} onChange={e => setContractor(e.target.value)} placeholder="e.g. Ramesh Gupta" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Contractor firm name</label>
                  <input className={inputCls} value={firm} onChange={e => setFirm(e.target.value)} placeholder="e.g. Gupta Construction Pvt. Ltd." />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Priority assessment</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Answer these 8 questions to calculate your project's MCDM priority score.</p>
              </div>

              <RadioGroup label="Q1. What is the current condition of this infrastructure?" name="condition" value={condition} onChange={setCondition}
                options={[
                  { value: 'critical', label: 'Critical — immediate risk, unsafe for use' },
                  { value: 'poor',     label: 'Poor — heavily deteriorated, causes daily problems' },
                  { value: 'fair',     label: 'Fair — visible damage, functional but degrading' },
                  { value: 'good',     label: 'Good — minor issues, preventive work needed' },
                ]}
              />
              <CheckGroup label="Q2. Have there been any reported incidents at this location?" values={incidents} onChange={setIncidents}
                options={[
                  { value: 'accidents',  label: 'Accidents or injuries' },
                  { value: 'collapse',   label: 'Infrastructure collapse or failure' },
                  { value: 'flooding',   label: 'Flooding or waterlogging' },
                  { value: 'none',       label: 'No incidents reported' },
                ]}
              />
              <div>
                <label className={labelCls}>Q3. When was the last major work done?</label>
                <input type="number" className={inputCls} value={lastWorkYear} onChange={e => setLastWorkYear(e.target.value)} placeholder="e.g. 2011" min="1950" max="2025" />
                <p className={hintCls}>Enter the year. If never repaired, enter construction year.</p>
              </div>
              <RadioGroup label="Q4. What is the current tender status?" name="tenderStatus" value={tenderStatus} onChange={setTenderStatus}
                options={[
                  { value: 'complete',    label: 'Tender complete — procurement finished' },
                  { value: 'in_process',  label: 'Tender in process — procurement underway' },
                  { value: 'planning',    label: 'Planning stage — tender not yet started' },
                ]}
              />
              <RadioGroup label="Q5. Has a contractor been assigned?" name="contractorAssigned" value={contractorAssigned} onChange={setContractorAssigned}
                options={[
                  { value: 'yes', label: 'Yes — contractor identified and assigned' },
                  { value: 'no',  label: 'No — contractor not yet assigned' },
                ]}
              />
              <RadioGroup label="Q6. Will the road be closed during work?" name="roadClosure" value={roadClosure} onChange={setRoadClosure}
                options={[
                  { value: 'full',    label: 'Full closure — road completely blocked' },
                  { value: 'partial', label: 'Partial closure — one lane or side remains open' },
                  { value: 'none',    label: 'No closure — traffic completely unaffected' },
                ]}
              />
              <CheckGroup label="Q7. Which utilities will be disrupted?" values={utilities} onChange={setUtilities}
                options={[
                  { value: 'water',       label: 'Water supply' },
                  { value: 'electricity', label: 'Electricity' },
                  { value: 'drainage',    label: 'Drainage and sewage' },
                  { value: 'gas',         label: 'Gas supply (PNG)' },
                  { value: 'none',        label: 'No utility disruption' },
                ]}
              />
              <div>
                <label className={labelCls}>Q8. How many days will citizens face disruption?</label>
                <input type="number" className={inputCls} value={disruptionDays} onChange={e => setDisruptionDays(e.target.value)} placeholder="e.g. 8" min="0" />
                <p className={hintCls}>Total days of disruption to daily life, not the full project duration.</p>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">Team assignment</h2>
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Assign a supervisor from your department.</p>
              </div>
              <div>
                <label className={labelCls}>Assigned supervisor</label>
                <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)}
                  disabled={supervisors.length === 0}
                  style={{ paddingRight: '32px' }}
                  className={`${inputCls} cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}>
                  <option value="">
                    {supervisors.length === 0 ? 'No supervisor available' : 'Select supervisor (optional)'}
                  </option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <p className={hintCls}>{supervisors.length === 0
                  ? 'Supervisors already assigned to your projects appear here. You have none yet — an administrator can assign one after the project is created.'
                  : 'Supervisors already assigned to your projects. You can also assign later from Project Detail.'}</p>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#E5E5E5] dark:border-[#27272A] flex-shrink-0">
        <button onClick={handleBack} disabled={step === 0}
          className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium text-[#6B7280] dark:text-[#9CA3AF] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280]">Step {step + 1} of {STEPS.length}</span>
          {submitError && <span className="text-[12px] text-[#DC2626] dark:text-[#F87171] mt-1">{submitError}</span>}
        </div>
        {step < 6 ? (
          <button onClick={handleNext}
            className="flex items-center gap-2 h-9 px-5 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
            Continue
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 h-9 px-5 text-[13px] font-medium text-white bg-[#16A34A] rounded-[6px] hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {editing ? 'Save changes' : 'Submit project'}
          </button>
        )}
      </div>

    </div>
  )
}
