// Public project detail. Only the fields a resident may see: what the work
// is, who runs it (by department, not by name), where it is, and how far
// along it stands. GET /projects/public/:id already strips everything else.

import { Link, useParams } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { usePublicProject } from "../../hooks/useResources"
import AsyncState from "../../components/AsyncState"
import { formatDateLong } from "../../components/dashboard"
import { deptStyle, PROJECT_STATUS_CONFIG, TYPE_STYLES } from "../../components/uiStyles"
import { LocationMap } from "../../gis"
import {
  Badge, Button, Container, DataRow, ProgressMeter, StatusPill, Surface,
} from "../../components/public/ui"
import { FOCUS_RING } from "../../components/public/controlStyles"

function BackLink() {
  return (
    <Link
      to="/projects"
      className={`inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A] transition-colors w-fit rounded-[6px] ${FOCUS_RING}`}
    >
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      All projects
    </Link>
  )
}

function CardTitle({ children }) {
  return <h2 className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-[0.09em]">{children}</h2>
}

function ScheduleStep({ label, value, done, last = false }) {
  return (
    <li className="relative pl-6 pb-5 last:pb-0">
      <span
        className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: done ? "#5E6AD2" : "#CBD5E1" }}
      />
      {!last && <span className="absolute left-[4.5px] top-4 bottom-0 w-px bg-[#E2E8F0]" aria-hidden="true" />}
      <p className="text-[12px] text-[#94A3B8]">{label}</p>
      <p className="text-[13.5px] font-medium text-[#0F172A] mt-0.5">{value}</p>
    </li>
  )
}

export default function CitizenProjectDetail() {
  const { id } = useParams()
  const { data: project, loading, error, reload } = usePublicProject(id)

  if (loading || error) {
    return (
      <CitizenNav>
        <Container className="py-10">
          <AsyncState loading={loading} error={error} onRetry={reload} label="Loading project...">{null}</AsyncState>
        </Container>
      </CitizenNav>
    )
  }

  if (!project) {
    return (
      <CitizenNav>
        <Container className="py-24 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-[16px] font-semibold text-[#0D2145]">Project not found</p>
          <p className="text-[13.5px] text-[#64748B] max-w-[46ch]">
            This project is not published on the portal, or the link is no longer valid.
          </p>
          <Button to="/projects" variant="secondary" size="md">Back to all projects</Button>
        </Container>
      </CitizenNav>
    )
  }

  const status = PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.pending
  const location = [project.address, project.ward, project.zone, project.city].filter(Boolean).join(", ")
  const hasCoords = Number.isFinite(project.centerLat) && Number.isFinite(project.centerLng)
  const coords = hasCoords ? `${project.centerLat.toFixed(5)}, ${project.centerLng.toFixed(5)}` : null
  // Only completed work carries a real end date; everything else is on its
  // originally planned schedule.
  const expectedCompletion = project.status === "completed" ? project.actualEndDate : project.endDate

  return (
    <CitizenNav>
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0]">
        <Container className="py-6 sm:py-9 flex flex-col gap-5">
          <BackLink />

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill config={status} />
              {project.department && <Badge className={deptStyle(project.department)}>{project.department}</Badge>}
              <Badge className={TYPE_STYLES[project.type] || TYPE_STYLES.Other}>{project.type}</Badge>
            </div>

            <div className="flex flex-col gap-1.5">
              <h1 className="text-[24px] sm:text-[30px] font-bold text-[#0D2145] tracking-[-0.025em] leading-tight max-w-[26ch]">
                {project.title}
              </h1>
              <p className="text-[13.5px] text-[#64748B]">
                {[project.departmentFull, project.ward].filter(Boolean).join(" · ") || "Ghaziabad Municipal Corporation"}
              </p>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-6 sm:py-8">
        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-3 items-start">
          <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-5">
            <Surface className="p-5 sm:p-6 flex flex-col gap-3">
              <CardTitle>About this project</CardTitle>
              <p className="text-[14.5px] text-[#0F172A] leading-[1.75] whitespace-pre-line">{project.description}</p>
            </Surface>

            <Surface className="p-5 sm:p-6 flex flex-col gap-4">
              <CardTitle>Location</CardTitle>
              <LocationMap
                height="300px"
                points={hasCoords ? [{ coord: { lat: project.centerLat, lng: project.centerLng }, label: project.title }] : []}
                emptyMessage="No map location has been published for this project."
              />
              <dl className="flex flex-col">
                <DataRow label="Ward" value={project.ward} />
                <DataRow label="Zone" value={project.zone} />
                <DataRow label="Address" value={location || project.city} />
                <DataRow label="Coordinates" value={coords} />
              </dl>
            </Surface>
          </div>

          <div className="flex flex-col gap-4 sm:gap-5">
            <Surface className="p-5 sm:p-6 flex flex-col gap-4">
              <CardTitle>Status</CardTitle>
              <StatusPill config={status} />
              <ProgressMeter value={project.progress} label="Reported progress" />
            </Surface>

            <Surface className="p-5 sm:p-6 flex flex-col gap-4">
              <CardTitle>Schedule</CardTitle>
              <ol className="flex flex-col">
                <ScheduleStep label="Planned start" value={formatDateLong(project.startDate)} done />
                <ScheduleStep label="Planned end" value={formatDateLong(project.endDate)} done={project.status === "completed"} />
                <ScheduleStep
                  label={project.status === "completed" ? "Completed on" : "Expected completion"}
                  value={formatDateLong(expectedCompletion)}
                  done={project.status === "completed"}
                  last
                />
              </ol>
            </Surface>

            <Surface className="p-5 sm:p-6 flex flex-col gap-2.5">
              <CardTitle>Something wrong here?</CardTitle>
              <p className="text-[13px] text-[#64748B] leading-relaxed">
                Report a problem at this location and track it with the reference number you receive.
              </p>
              <Button to="/complaints/new" variant="secondary" size="sm" className="w-fit">Report an issue</Button>
            </Surface>
          </div>
        </div>
      </Container>
    </CitizenNav>
  )
}
