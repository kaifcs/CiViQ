// Map of this officer's own projects. Lazily loaded — one of only two routes
// that pull in Leaflet.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '../../hooks/useResources'
import AsyncState from '../../components/AsyncState'
import {
  MapContainer, ProjectLayer, FIT_BOUNDS_PADDING,
  PROJECT_TYPE_COLORS, toBoundsTuple,
} from '../../gis'
import { coordinateOf, viewportForRecords } from '../../gis/gisService'
import { DEPT_STYLES, PROJECT_STATUS_CONFIG } from '../../components/uiStyles'

const SELECTED_ZOOM = 16

// Marker/legend colours resolve through the GIS module; see gis/projectStyles.
const TYPE_CONFIG = {
  Road:       { dot: PROJECT_TYPE_COLORS.Road },       Water:      { dot: PROJECT_TYPE_COLORS.Water },
  Electrical: { dot: PROJECT_TYPE_COLORS.Electrical }, Sewage:     { dot: PROJECT_TYPE_COLORS.Sewage },
  Parks:      { dot: PROJECT_TYPE_COLORS.Parks },      Other:      { dot: PROJECT_TYPE_COLORS.Other },
}
const TYPE_BADGE = { Road: 'bg-[#FFF7ED] text-[#C2410C] dark:bg-[#1A0E05] dark:text-[#FB923C]', Water: 'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#0A1220] dark:text-[#60A5FA]', Sewage: 'bg-[#F5F3FF] text-[#6D28D9] dark:bg-[#130C22] dark:text-[#A78BFA]', Electrical: 'bg-[#FEFCE8] text-[#A16207] dark:bg-[#181305] dark:text-[#FACC15]', Parks: 'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]', Other: 'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]' }

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ minWidth: '150px', paddingRight: '32px' }}
      className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer">
      <option value="">{label}: All</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function OfficerMap() {
  const navigate = useNavigate()
  const { data: projects, loading, error, reload } = useProjects()
  const [filterType,   setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)

  const mapRef = useRef(null)
  const handleMapReady = useCallback((map) => { mapRef.current = map }, [])

  // Officers plan around committed work only: pending and rejected are hidden.
  // Memoised to keep the derived map bounds identity-stable across renders.
  const visibleProjects = useMemo(() => (projects || []).filter(p => {
    if (!['approved', 'active'].includes(p.status)) return false
    if (filterType   && p.type !== filterType)     return false
    if (filterStatus && p.status !== filterStatus) return false
    return true
  }), [projects, filterType, filterStatus])

  const selected = selectedProject ? projects.find(p => p.id === selectedProject) : null
  const selectedStatus = selected ? PROJECT_STATUS_CONFIG[selected.status] : null

  const autoBounds = useMemo(() => viewportForRecords(visibleProjects), [visibleProjects])
  const selectedCoord = selected ? coordinateOf(selected) : null

  function resetView() {
    setSelectedProject(null)
    const tuple = toBoundsTuple(viewportForRecords(visibleProjects))
    if (tuple && mapRef.current) {
      mapRef.current.flyToBounds(tuple, { padding: FIT_BOUNDS_PADDING })
    }
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading map data...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] bg-[#EEF2FF] dark:bg-[#131629] border border-[#C7D2FE] dark:border-[#252870] flex-shrink-0">
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" className="text-[#5E6AD2] flex-shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p className="text-[12px] text-[#4338CA] dark:text-[#818CF8]">Showing approved and active projects only. Use this map to plan your submissions and avoid clashes.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        <FilterSelect label="Type" value={filterType} onChange={v => { setFilterType(v); setSelectedProject(null) }}
          options={[{ value: 'Road', label: 'Road' }, { value: 'Water', label: 'Water' }, { value: 'Sewage', label: 'Sewage' }, { value: 'Electrical', label: 'Electrical' }, { value: 'Parks', label: 'Parks' }]}
        />
        <FilterSelect label="Status" value={filterStatus} onChange={v => { setFilterStatus(v); setSelectedProject(null) }}
          options={[{ value: 'approved', label: 'Approved' }, { value: 'active', label: 'Active' }]}
        />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">{visibleProjects.length} projects on map</span>
          <button onClick={resetView} className="text-[13px] text-[#5E6AD2] font-medium">Reset view</button>
          {(filterType || filterStatus) && <button onClick={() => { setFilterType(''); setFilterStatus('') }} className="text-[13px] text-[#5E6AD2] font-medium">Clear</button>}
        </div>
      </div>

      {/* Narrow viewports stack: below lg the fixed 300px drawer column would
          squeeze the map to zero width. */}
      <div className="flex-1 min-h-0 grid gap-4 grid-cols-1 lg:grid-cols-[1fr_300px]">

        <div className="rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] flex flex-col overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex-1 relative">
            <MapContainer
              bounds={selectedCoord ? undefined : autoBounds}
              center={selectedCoord || undefined}
              zoom={selectedCoord ? SELECTED_ZOOM : undefined}
              onReady={handleMapReady}
            >
              <ProjectLayer
                projects={visibleProjects}
                selectedId={selectedProject}
                onSelect={(id) => setSelectedProject(prev => (prev === id ? null : id))}
              />
            </MapContainer>
            {visibleProjects.length === 0 && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#F8FAFC]/85 dark:bg-[#18181B]/85 pointer-events-none">
                <div className="text-center">
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mx-auto mb-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                  <p className="text-[14px] font-medium text-[#9CA3AF]">No projects match filters</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex-shrink-0 border-t border-[#E5E5E5] dark:border-[#27272A] px-5 py-3 flex items-center gap-5 flex-wrap bg-[#FFFFFF] dark:bg-[#1C1C1F]">
            <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Legend</span>
            {Object.entries(TYPE_CONFIG).map(([type, config]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.dot }} />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] flex flex-col overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] flex items-center justify-center">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#6B7280] dark:text-[#9CA3AF]">No project selected</p>
                <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1 leading-relaxed">Click any marker on the map to see project details here</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-shrink-0 px-4 py-3 border-b border-[#E5E5E5] dark:border-[#27272A] flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em]">Project details</p>
                <button onClick={() => setSelectedProject(null)} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: TYPE_CONFIG[selected.type]?.dot || '#6B7280' }} />
                  <h3 className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">{selected.title}</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${DEPT_STYLES[selected.department] || ''}`}>{selected.department}</span>
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[selected.type] || ''}`}>{selected.type}</span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${selectedStatus?.bg} ${selectedStatus?.color}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedStatus?.dot }} />{selectedStatus?.text}
                  </span>
                </div>
                <div className="flex flex-col">
                  {[
                    { label: 'Ward',       value: selected.ward },
                    { label: 'Officer',    value: selected.officerName },
                    { label: 'Start date', value: new Date(selected.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                    { label: 'End date',   value: new Date(selected.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                    { label: 'MCDM Score', value: `${selected.mcdmScore} / 100` },
                  ].map(row => (
                    <div key={row.label} className="flex items-start justify-between py-2 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
                      <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{row.label}</span>
                      <span className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC] text-right ml-4">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 p-4 border-t border-[#E5E5E5] dark:border-[#27272A]">
                <button onClick={() => navigate(`/officer/projects/${selected.id}`)}
                  className="w-full h-9 flex items-center justify-center gap-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors">
                  View full project
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      <style>{`@keyframes civiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
    </AsyncState>
  )
}