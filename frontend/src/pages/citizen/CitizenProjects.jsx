// Public project explorer. Read-only: lists work the city has approved,
// started, finished or rescheduled — the backend's public filter already
// keeps pending and rejected projects out of this list.

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { usePublicProjects } from "../../hooks/useResources"
import AsyncState, { EmptyState } from "../../components/AsyncState"
import { formatDate } from "../../components/dashboard"
import { deptStyle, PROJECT_STATUS_CONFIG, TYPE_STYLES } from "../../components/uiStyles"

const SearchIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: "160px" }}
      className="h-9 px-3 text-[13px] rounded-[8px] border border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Badge({ label, className }) {
  return <span className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ${className}`}>{label}</span>
}

function StatusBadge({ status }) {
  const c = PROJECT_STATUS_CONFIG[status] || PROJECT_STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${c.bg} ${c.color}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {c.text}
    </span>
  )
}

function ProjectCard({ project, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex flex-col md:flex-row md:items-center gap-4 md:gap-5 px-5 py-4 bg-[#FFFFFF] border border-[#E5E5E5] rounded-[8px] cursor-pointer transition-all hover:border-[#5E6AD2]/40 hover:bg-[#FAFAFA]"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#0F172A] truncate leading-snug">{project.title}</p>
        <p className="text-[12px] text-[#6B7280] mt-0.5">{project.departmentFull} · {project.ward || "Ghaziabad"}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge label={project.department || "—"} className={deptStyle(project.department)} />
        <Badge label={project.type} className={TYPE_STYLES[project.type] || TYPE_STYLES.Other} />
      </div>

      <div className="hidden md:block w-px h-8 bg-[#E5E5E5] flex-shrink-0" />

      <div className="flex-shrink-0 w-[110px]">
        <StatusBadge status={project.status} />
      </div>

      <div className="hidden md:block w-px h-8 bg-[#E5E5E5] flex-shrink-0" />

      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Timeline</span>
          <span className="text-[13px] font-medium text-[#0F172A]">
            {formatDate(project.startDate)} – {formatDate(project.endDate)}
          </span>
        </div>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>
  )
}

export default function CitizenProjects() {
  const navigate = useNavigate()
  const { data: projects, loading, error, reload } = usePublicProjects()

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
      <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div>
          <h1 className="text-[24px] font-semibold text-[#0F172A]">Infrastructure Projects</h1>
          <p className="text-[13px] text-[#6B7280] mt-1">
            Infrastructure projects the city has approved, started, finished or rescheduled.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative flex items-center">
            <span className="absolute left-3 text-[#9CA3AF] pointer-events-none flex items-center"><SearchIcon /></span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects by name..."
              className="w-full h-10 pl-10 pr-4 text-[14px] rounded-[8px] border border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <FilterSelect
              label="Type"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: "Road", label: "Road" },
                { value: "Water", label: "Water" },
                { value: "Sewage", label: "Sewage" },
                { value: "Electrical", label: "Electrical" },
                { value: "Parks", label: "Parks" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "approved", label: "Approved" },
                { value: "active", label: "Active" },
                { value: "completed", label: "Completed" },
                { value: "rescheduled", label: "Rescheduled" },
              ]}
            />
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-[13px] text-[#6B7280]">
                {filtered.length} {filtered.length === 1 ? "project" : "projects"}
              </span>
              {hasFilters && (
                <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        <AsyncState loading={loading} error={error} onRetry={reload} label="Loading projects...">
          {filtered.length === 0 ? (
            <EmptyState title="No projects found" hint="Try a different search or filter." />
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
              ))}
            </div>
          )}
        </AsyncState>
      </div>
    </CitizenNav>
  )
}
