// Public project detail. Only the fields a resident may see: what the work
// is, who runs it (by department, not by name), where it is, and how far
// along it stands. GET /projects/public/:id already strips everything else.

import { useNavigate, useParams } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { usePublicProject } from "../../hooks/useResources"
import AsyncState from "../../components/AsyncState"
import { formatDateLong } from "../../components/dashboard"
import { DEPT_STYLES, PROJECT_STATUS_CONFIG, TYPE_STYLES } from "../../components/uiStyles"

function Card({ children, className = "" }) {
  return (
    <div className={`bg-[#FFFFFF] border border-[#E5E5E5] rounded-[8px] ${className}`} style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      {children}
    </div>
  )
}
function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.06em] mb-4">{children}</p>
}
function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[#F3F4F6] last:border-0">
      <span className="text-[13px] text-[#6B7280] w-40 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-[#0F172A] font-medium text-right">{value || "—"}</span>
    </div>
  )
}

export default function CitizenProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: project, loading, error, reload } = usePublicProject(id)

  if (loading || error) {
    return (
      <CitizenNav>
        <div className="max-w-[1200px] mx-auto px-6 py-8">
          <AsyncState loading={loading} error={error} onRetry={reload} label="Loading project...">{null}</AsyncState>
        </div>
      </CitizenNav>
    )
  }

  if (!project) {
    return (
      <CitizenNav>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <p className="text-[15px] text-[#6B7280]">Project not found</p>
          <button onClick={() => navigate("/projects")} className="text-[13px] text-[#5E6AD2]">← Back to City Explorer</button>
        </div>
      </CitizenNav>
    )
  }

  const status = PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.pending
  const location = [project.address, project.ward, project.zone, project.city].filter(Boolean).join(", ")
  const coords = Number.isFinite(project.centerLat) && Number.isFinite(project.centerLng)
    ? `${project.centerLat.toFixed(5)}, ${project.centerLng.toFixed(5)}`
    : null
  // Only completed work carries a real end date; everything else is on its
  // originally planned schedule.
  const expectedCompletion = project.status === "completed" ? project.actualEndDate : project.endDate

  return (
    <CitizenNav>
      <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col gap-5" style={{ fontFamily: "'Inter', sans-serif" }}>
        <button onClick={() => navigate("/projects")} className="flex items-center gap-1.5 text-[13px] text-[#6B7280] hover:text-[#0F172A] transition-colors w-fit">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to City Explorer
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2.5">
              <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${DEPT_STYLES[project.department] || DEPT_STYLES.Other}`}>{project.department || "—"}</span>
              <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[project.type] || TYPE_STYLES.Other}`}>{project.type}</span>
              <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${status.bg} ${status.color}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.dot }} />
                {status.text}
              </span>
            </div>
            <h1 className="text-[22px] font-semibold text-[#0F172A] leading-snug">{project.title}</h1>
            <p className="text-[13px] text-[#6B7280] mt-1">{project.departmentFull}</p>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <SectionLabel>Description</SectionLabel>
            <p className="text-[14px] text-[#0F172A] leading-relaxed whitespace-pre-line">{project.description}</p>

            <div className="mt-6">
              <SectionLabel>Progress</SectionLabel>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                  <div className="h-full rounded-full bg-[#5E6AD2]" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
                </div>
                <span className="text-[13px] font-semibold text-[#0F172A] w-10 text-right">{project.progress}%</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionLabel>Timeline</SectionLabel>
            <InfoRow label="Planned start" value={formatDateLong(project.startDate)} />
            <InfoRow label="Planned end" value={formatDateLong(project.endDate)} />
            <InfoRow label="Expected completion" value={formatDateLong(expectedCompletion)} />
          </Card>

          <Card className="p-5 lg:col-span-3">
            <SectionLabel>Location</SectionLabel>
            <InfoRow label="Ward" value={project.ward} />
            <InfoRow label="Zone" value={project.zone} />
            <InfoRow label="Address" value={location || project.city} />
            <InfoRow label="Coordinates" value={coords} />
          </Card>
        </div>
      </div>
    </CitizenNav>
  )
}
