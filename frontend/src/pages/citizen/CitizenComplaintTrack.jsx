// Public complaint tracking by reference number.

import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { useComplaint } from "../../hooks/useResources"
import { COMPLAINT_STATUS_CONFIG } from "../../components/uiStyles"
import { formatDateLong } from "../../components/dashboard"
import { Button, Container, Eyebrow, Notice, StatusPill, Surface } from "../../components/public/ui"
import { FOCUS_RING, inputCls } from "../../components/public/controlStyles"

const STAGES = ["submitted", "acknowledged", "in_progress", "resolved"]
const CNR_PARAM = "cnr"

function StageTimeline({ currentStage }) {
  return (
    <ol className="flex flex-col">
      {STAGES.map((stage, index) => {
        const config = COMPLAINT_STATUS_CONFIG[stage]
        const reached = index <= currentStage
        const isCurrent = index === currentStage
        const last = index === STAGES.length - 1

        return (
          <li key={stage} className="relative pl-7 pb-5 last:pb-0">
            <span
              className="absolute left-0 top-[3px] w-3 h-3 rounded-full border-2 border-[#FFFFFF]"
              style={{ backgroundColor: reached ? config.dot : "#E2E8F0", boxShadow: isCurrent ? `0 0 0 3px ${config.dot}33` : "none" }}
            />
            {!last && (
              <span
                className="absolute left-[5px] top-[18px] bottom-0 w-0.5 rounded-full"
                style={{ backgroundColor: index < currentStage ? config.dot : "#EEF1F6" }}
                aria-hidden="true"
              />
            )}
            <p className={`text-[13.5px] ${reached ? "font-semibold text-[#0F172A]" : "text-[#94A3B8]"}`}>
              {config.text}
            </p>
            {isCurrent && <p className="text-[12px] text-[#64748B] mt-0.5">Current stage</p>}
          </li>
        )
      })}
    </ol>
  )
}

export default function CitizenComplaintTrack() {
  const [params, setParams] = useSearchParams()
  const [input, setInput] = useState(params.get(CNR_PARAM) || "")

  // URL-driven lookup keeps tracking links refreshable.
  const queryCnr = params.get(CNR_PARAM) || ""
  const { data: complaint, loading, error } = useComplaint(queryCnr)

  // Hide whether a reference exists from unauthenticated callers.
  const errorMessage = !error
    ? ""
    : error.status === 404
      ? "No complaint found with that reference number. Check it and try again."
      : error.message

  function handleSubmit(event) {
    event.preventDefault()
    const value = input.trim()
    if (!value) return
    setParams(value ? { [CNR_PARAM]: value } : {})
  }

  const currentStage = complaint ? STAGES.indexOf(complaint.status) : -1

  return (
    <CitizenNav>
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0]">
        <Container width="narrow" className="py-10 sm:py-12 flex flex-col gap-3">
          <Eyebrow>Residents</Eyebrow>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#0D2145] tracking-[-0.03em] leading-tight">
            Track a complaint
          </h1>
          <p className="text-[14.5px] text-[#64748B] leading-relaxed">
            Enter the reference number you were given when you reported the issue.
          </p>
        </Container>
      </div>

      <Container width="narrow" className="py-6 sm:py-8 flex flex-col gap-5">
        <Surface as="form" onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <label htmlFor="cnr" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
              Reference number
            </label>
            <input
              id="cnr"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. CNR-100042"
              className={`${inputCls} font-mono placeholder:font-sans`}
            />
          </div>
          <Button type="submit" size="md" disabled={loading || !input.trim()} className="w-full sm:w-auto">
            {loading ? "Looking up..." : "Track"}
          </Button>
        </Surface>

        {errorMessage && (
          <div role="alert">
            <Notice tone="danger">{errorMessage}</Notice>
          </div>
        )}

        {complaint && !errorMessage && (
          <Surface className="p-5 sm:p-7 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[12.5px] font-bold font-mono text-[#5E6AD2] break-all">{complaint.cnrId}</p>
                <h2 className="text-[19px] sm:text-[21px] font-semibold text-[#0D2145] tracking-[-0.02em]">
                  {complaint.issueType}
                </h2>
                <p className="text-[13px] text-[#64748B]">
                  Reported {formatDateLong(complaint.filedAt)}
                  {complaint.ward ? ` · ${complaint.ward}` : ""}
                </p>
              </div>
              <StatusPill config={COMPLAINT_STATUS_CONFIG[complaint.status] || COMPLAINT_STATUS_CONFIG.submitted} />
            </div>

            <p className="text-[14px] text-[#0F172A] leading-[1.75] pt-5 border-t border-[#F1F5F9]">
              {complaint.description}
            </p>

            <div className="flex flex-col gap-4 pt-5 border-t border-[#F1F5F9]">
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-[0.09em]">Progress</p>
              <StageTimeline currentStage={currentStage} />
            </div>

            <p className="text-[12px] text-[#94A3B8] leading-relaxed pt-5 border-t border-[#F1F5F9]">
              Handling details, including the assigned department and officer,
              are not published on the public portal.
            </p>
          </Surface>
        )}

        <p className="text-[13px] text-[#64748B]">
          Nothing to track yet?{" "}
          <Link to="/complaints/new" className={`font-medium text-[#5E6AD2] hover:text-[#4A56C1] transition-colors rounded-[4px] ${FOCUS_RING}`}>
            Report an issue
          </Link>
        </p>
      </Container>
    </CitizenNav>
  )
}
