// Public project explorer. Read-only: lists work the city has approved,
// started, finished or rescheduled — the backend's public filter already
// keeps pending and rejected projects out of this list.

import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { usePublicProjects } from "../../hooks/useResources"
import AsyncState, { EmptyState } from "../../components/AsyncState"
import { formatDate } from "../../components/dashboard"
import { deptStyle, PROJECT_STATUS_CONFIG, TYPE_STYLES } from "../../components/uiStyles"
import {
  Badge, Button, Container, Eyebrow, Notice, ProgressMeter, StatusPill, Surface,
} from "../../components/public/ui"
import { inputCls, selectChevron, selectCls } from "../../components/public/controlStyles"
import { PUBLIC_PROJECT_STATUSES } from "../../services"

const STATUS_OPTIONS = PUBLIC_PROJECT_STATUSES.map((value) => ({
  value,
  label: PROJECT_STATUS_CONFIG[value].text,
}))

const TYPE_OPTIONS = ["Road", "Water", "Sewage", "Electrical", "Parks"].map((value) => ({ value, label: value }))

const SearchIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

function FilterSelect({ id, label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0 flex-1 sm:flex-none sm:w-[170px]">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={selectChevron}
        className={`${selectCls} h-10`}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function ProjectCard({ project }) {
  const location = [project.ward, project.zone].filter(Boolean).join(" · ")
  return (
    <Surface as="article" interactive className="flex flex-col">
      <Link
        to={`/projects/${project.id}`}
        className="flex flex-col gap-4 p-5 h-full rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/45 focus-visible:ring-offset-1"
      >
        <div className="flex items-start justify-between gap-3">
          <StatusPill config={PROJECT_STATUS_CONFIG[project.status] || PROJECT_STATUS_CONFIG.pending} size="sm" />
          <span className="text-[12px] text-[#94A3B8] tabular-nums whitespace-nowrap">
            {formatDate(project.startDate)} – {formatDate(project.endDate)}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <h2 className="text-[15.5px] font-semibold text-[#0D2145] leading-snug line-clamp-2">{project.title}</h2>
          <p className="text-[12.5px] text-[#64748B]">
            {project.departmentFull || "Department not listed"}
            {location ? ` · ${location}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {project.department && <Badge className={deptStyle(project.department)}>{project.department}</Badge>}
          <Badge className={TYPE_STYLES[project.type] || TYPE_STYLES.Other}>{project.type}</Badge>
        </div>

        <div className="pt-3.5 border-t border-[#F1F5F9]">
          <ProgressMeter value={project.progress} />
        </div>
      </Link>
    </Surface>
  )
}

export default function CitizenProjects() {
  const { data, loading, error, reload } = usePublicProjects()
  const projects = data?.items

  // Search and filters only see fetched rows, so pagination metadata is surfaced
  // instead of making a capped result look complete.
  const total = data?.pagination?.total ?? null
  const truncated = total !== null && Number.isFinite(total) && total > (projects?.length ?? 0)

  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("")
  const [filterStatus, setFilterStatus] = useState("")

  const filtered = useMemo(() => {
    return (projects || []).filter((p) => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterType && p.type !== filterType) return false
      if (filterStatus && p.status !== filterStatus) return false
      return true
    })
  }, [projects, search, filterType, filterStatus])

  const hasFilters = search || filterType || filterStatus
  function clearFilters() {
    setSearch("")
    setFilterType("")
    setFilterStatus("")
  }

  return (
    <CitizenNav>
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0]">
        <Container className="py-10 sm:py-12 flex flex-col gap-3">
          <Eyebrow>Public register</Eyebrow>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#0D2145] tracking-[-0.03em] leading-tight">
            Infrastructure projects
          </h1>
          <p className="text-[14.5px] text-[#64748B] leading-relaxed max-w-[62ch]">
            Infrastructure projects the city has approved, started, finished or rescheduled.
          </p>
        </Container>
      </div>

      <Container className="py-6 sm:py-8 flex flex-col gap-5">
        <Surface className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-[#94A3B8] pointer-events-none flex items-center"><SearchIcon /></span>
            <label htmlFor="project-search" className="sr-only">Search projects by name</label>
            <input
              id="project-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects by name..."
              className={`${inputCls} pl-11`}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex gap-3 flex-1 min-w-0">
              <FilterSelect id="filter-type" label="Type" value={filterType} onChange={setFilterType} options={TYPE_OPTIONS} />
              <FilterSelect id="filter-status" label="Status" value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} />
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 sm:pb-2">
              <span className="text-[13px] text-[#64748B]" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? "project" : "projects"}
              </span>
              {hasFilters && (
                <Button variant="quiet" size="sm" onClick={clearFilters}>Clear filters</Button>
              )}
            </div>
          </div>
        </Surface>

        {truncated && (
          <Notice tone="warning">
            Showing the {projects.length} most recent of {total} projects. Search and
            filters apply only to these.
          </Notice>
        )}

        <AsyncState loading={loading} error={error} onRetry={reload} label="Loading projects...">
          {filtered.length === 0 ? (
            <Surface className="py-4">
              <EmptyState
                title="No projects found"
                hint={hasFilters ? "Try a different search or filter." : "Nothing has been published to the portal yet."}
                action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
              />
            </Surface>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </AsyncState>
      </Container>
    </CitizenNav>
  )
}
