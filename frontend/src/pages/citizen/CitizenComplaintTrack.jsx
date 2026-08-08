// Public complaint tracking by reference number.

import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { useComplaint } from "../../hooks/useResources"
import { COMPLAINT_STATUS_CONFIG } from "../../components/uiStyles"
import { formatDateLong } from "../../components/dashboard"

const STAGES = ["submitted", "acknowledged", "in_progress", "resolved"]
const CNR_PARAM = "cnr"

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
      <div className="max-w-[720px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0F172A]">
            Track a complaint
          </h1>
          <p className="text-[13px] text-[#6B7280] mt-1">
            Enter the reference number you were given when you reported the issue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-3 mb-7">
          <label htmlFor="cnr" className="sr-only">
            Reference number
          </label>

          <input
            id="cnr"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. CNR-100042"
            className="flex-1 h-10 px-3 text-[14px] font-mono rounded-[8px] border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#9CA3AF] placeholder:font-sans focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-10 px-5 text-[14px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Looking up..." : "Track"}
          </button>
        </form>

        {errorMessage && (
          <div
            role="alert"
            className="bg-white border border-[#FECACA] rounded-[8px] p-4 text-[13px] text-[#B91C1C]"
          >
            {errorMessage}
          </div>
        )}

        {complaint && !errorMessage && (
          <div className="bg-white border border-[#E5E5E5] rounded-[12px] p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[13px] font-bold font-mono text-[#5E6AD2]">
                  {complaint.cnrId}
                </p>

                <h2 className="text-[18px] font-bold text-[#0F172A] mt-1">
                  {complaint.issueType}
                </h2>

                <p className="text-[13px] text-[#6B7280] mt-0.5">
                  Reported {formatDateLong(complaint.filedAt)}
                  {complaint.ward ? ` · ${complaint.ward}` : ""}
                </p>
              </div>

              {(() => {
                const s =
                  COMPLAINT_STATUS_CONFIG[complaint.status] ||
                  COMPLAINT_STATUS_CONFIG.submitted

                return (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.color}`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.dot }}
                    />
                    {s.text}
                  </span>
                )
              })()}
            </div>

            <p className="text-[13px] text-[#0F172A] leading-relaxed mt-4 pt-4 border-t border-[#F3F4F6]">
              {complaint.description}
            </p>

            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.06em] mt-6 mb-3">
              Progress
            </p>

            <ol className="flex flex-col gap-3">
              {STAGES.map((stage, index) => {
                const config = COMPLAINT_STATUS_CONFIG[stage]
                const reached = index <= currentStage

                return (
                  <li key={stage} className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: reached ? config.dot : "#E5E7EB",
                      }}
                    />

                    <span
                      className={`text-[13px] ${
                        reached
                          ? "font-semibold text-[#0F172A]"
                          : "text-[#9CA3AF]"
                      }`}
                    >
                      {config.text}
                    </span>
                  </li>
                )
              })}
            </ol>

            <p className="text-[12px] text-[#9CA3AF] mt-6 pt-4 border-t border-[#F3F4F6]">
              Handling details, including the assigned department and officer,
              are not published on the public portal.
            </p>
          </div>
        )}

        <p className="text-[13px] text-[#6B7280] mt-7">
          Nothing to track yet?{" "}
          <Link
            to="/complaints/new"
            className="font-medium text-[#5E6AD2] hover:text-[#4A56C1]"
          >
            Report an issue
          </Link>
        </p>
      </div>
    </CitizenNav>
  )
}