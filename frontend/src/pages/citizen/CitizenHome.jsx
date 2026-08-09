// Public landing page for the Citizen portal.

import { Link } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { formatDate } from "../../components/dashboard"
import { Button, Container, Eyebrow, SectionHeading, Surface } from "../../components/public/ui"
import { FOCUS_RING } from "../../components/public/controlStyles"
import { COMPLAINT_STATUS_CONFIG, PROJECT_STATUS_CONFIG } from "../../components/uiStyles"
import { ISSUE_TYPE_OPTIONS } from "../../services"
import { usePublicProjects } from "../../hooks/useResources"

// Number of published projects previewed in the hero panel.
const PREVIEW_COUNT = 5

// Complaint workflow stages, labelled from the shared status table.
const COMPLAINT_STAGES = ["submitted", "acknowledged", "in_progress", "resolved"]

function PortalGrid() {
  return (
    <svg
      viewBox="0 0 640 420"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="absolute inset-0 w-full h-full opacity-[0.35]"
    >
      {[60, 150, 240, 330, 420].map((y) => (
        <rect key={`h${y}`} x="0" y={y - 3} width="640" height="6" fill="#E2E8F0" rx="1" />
      ))}
      {[80, 220, 360, 500, 640].map((x) => (
        <rect key={`v${x}`} x={x - 3} y="0" width="6" height="420" fill="#E2E8F0" rx="1" />
      ))}
      {[60, 150, 240, 330].flatMap((y) =>
        [80, 220, 360, 500].map((x) => <circle key={`d${x}-${y}`} cx={x} cy={y} r="3.5" fill="#C7CDF5" />)
      )}
    </svg>
  )
}

function PreviewRow({ project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className={`group flex items-center gap-3 px-4 py-3 border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] transition-colors ${FOCUS_RING} focus-visible:ring-offset-0`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: (PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.pending).dot }}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-medium text-[#0F172A] truncate group-hover:text-[#3F4899] transition-colors">
          {project.title}
        </span>
        <span className="block text-[12px] text-[#94A3B8] truncate">
          {[project.departmentFull, project.ward].filter(Boolean).join(" · ") || project.type}
        </span>
      </span>
      <span className="text-[12px] text-[#94A3B8] tabular-nums flex-shrink-0 hidden sm:block">
        {formatDate(project.startDate)}
      </span>
    </Link>
  )
}

function PreviewSkeleton() {
  return (
    <div className="px-4 py-3.5 flex flex-col gap-2 border-b border-[#F1F5F9] last:border-0">
      <div className="h-3 w-3/5 rounded-full bg-[#EEF1F6] animate-pulse" />
      <div className="h-2.5 w-2/5 rounded-full bg-[#F1F5F9] animate-pulse" />
    </div>
  )
}

function PublishedProjectsPanel() {
  const { data, loading, error, reload } = usePublicProjects()
  const projects = data?.items || []
  const total = data?.pagination?.total
  const hasTotal = Number.isFinite(total)

  return (
    <Surface className="overflow-hidden w-full">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#E2E8F0] bg-[#FCFCFD]">
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-[#0D2145]">Published projects</span>
          <span className="text-[12px] text-[#94A3B8]">
            {hasTotal ? `${total} on the portal` : "Live from the city register"}
          </span>
        </div>
        <Link to="/projects" className={`text-[12.5px] font-medium text-[#5E6AD2] hover:text-[#4A56C1] transition-colors rounded-[4px] ${FOCUS_RING}`}>
          View all
        </Link>
      </div>

      {loading && <div>{Array.from({ length: PREVIEW_COUNT }, (_, i) => <PreviewSkeleton key={i} />)}</div>}

      {!loading && error && (
        <div className="px-4 py-8 flex flex-col items-center gap-2.5 text-center">
          <p className="text-[13px] text-[#64748B]">The project register could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={reload}>Try again</Button>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-[13px] text-[#64748B]">No projects have been published yet.</p>
        </div>
      )}

      {!loading && !error && projects.slice(0, PREVIEW_COUNT).map((p) => <PreviewRow key={p.id} project={p} />)}
    </Surface>
  )
}

export default function CitizenHome() {
  return (
    <CitizenNav>
      <section className="relative bg-[#FFFFFF] border-b border-[#E2E8F0] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <PortalGrid />
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(255,255,255,0.55)] via-[rgba(255,255,255,0.9)] to-[#FFFFFF]" />
        </div>

        <Container className="relative py-14 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center">
            <div className="flex flex-col items-start gap-5 civiq-rise">
              <Eyebrow>Ghaziabad Municipal Corporation</Eyebrow>
              <h1 className="text-[32px] sm:text-[40px] lg:text-[46px] font-bold text-[#0D2145] leading-[1.08] tracking-[-0.03em] max-w-[15ch]">
                Smart, coordinated infrastructure work
              </h1>
              <p className="text-[15px] sm:text-[16px] text-[#64748B] leading-relaxed max-w-[52ch]">
                CIVIQ is the city's Smart Urban Project Coordination Platform. Departments plan and sequence
                road, water, sewage, electrical and parks work on one timeline, so the same street is not dug
                up twice — and residents can see what is being built, where, and when.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto pt-1">
                <Button to="/projects" size="lg" className="w-full sm:w-auto">View public projects</Button>
                <Button to="/complaints/new" variant="secondary" size="lg" className="w-full sm:w-auto">Report an issue</Button>
              </div>
            </div>

            <div className="civiq-rise civiq-rise-delay">
              <PublishedProjectsPanel />
            </div>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="for-residents">
        <Container className="flex flex-col gap-8 sm:gap-10">
          <SectionHeading
            id="for-residents"
            eyebrow="For residents"
            title="Report an issue, then follow it through"
            description="No account needed. You get a reference number as soon as you submit."
          />

          <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2">
            <Surface className="p-5 sm:p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[15.5px] font-semibold text-[#0D2145]">Report a civic issue</h3>
                <p className="text-[13.5px] text-[#64748B] leading-relaxed">
                  Describe the problem and drop a pin on the map. These are the issue types the city accepts here.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ISSUE_TYPE_OPTIONS.map((option) => (
                  <span key={option.value} className="text-[11.5px] font-medium px-2.5 py-1 rounded-[6px] bg-[#F1F5F9] text-[#475569]">
                    {option.label}
                  </span>
                ))}
              </div>
              <Button to="/complaints/new" variant="secondary" size="sm" className="w-fit mt-auto">Report an issue</Button>
            </Surface>

            <Surface className="p-5 sm:p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[15.5px] font-semibold text-[#0D2145]">Track a complaint</h3>
                <p className="text-[13.5px] text-[#64748B] leading-relaxed">
                  Your reference number shows the stage it has reached. Handling details stay internal.
                </p>
              </div>
              <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {COMPLAINT_STAGES.map((stage) => (
                  <li key={stage} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COMPLAINT_STATUS_CONFIG[stage].dot }} />
                    <span className="text-[13px] text-[#475569]">{COMPLAINT_STATUS_CONFIG[stage].text}</span>
                  </li>
                ))}
              </ol>
              <Button to="/complaints/track" variant="secondary" size="sm" className="w-fit mt-auto">Track a complaint</Button>
            </Surface>
          </div>
        </Container>
      </section>

      <section className="bg-[#0D2145]">
        <Container className="py-12 sm:py-14">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col gap-2 max-w-[54ch]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9BA3F0]">For municipal staff</span>
              <h2 className="text-[21px] sm:text-[24px] font-semibold text-[#FFFFFF] tracking-[-0.02em]">
                Sign in to coordinate city works
              </h2>
              <p className="text-[14px] leading-relaxed text-[rgba(255,255,255,0.55)]">
                Coordinators, engineers and supervisors schedule work, resolve clashes between departments
                and route resident complaints.
              </p>
            </div>
            <Button to="/login" variant="onDark" size="lg" className="w-full md:w-auto">Staff Login</Button>
          </div>
        </Container>
      </section>
    </CitizenNav>
  )
}
