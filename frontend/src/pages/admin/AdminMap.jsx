import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AsyncState from '../../components/AsyncState'
import { useProjects, useComplaints, useDepartments, useConflicts, useDepartmentOptions } from '../../hooks/useResources'
import {
  MapContainer, ProjectLayer, ComplaintLayer, DepartmentLayer, UtilityLayer, ConflictLayer,
  HeatmapLayer, HeatmapLegend,
  FIT_BOUNDS_PADDING, PROJECT_TYPE_COLORS, PROJECT_STATUS_COLORS, PROJECT_PRIORITIES,
  complaintStyles, departmentStyles, utilityStyles, conflictStyles, heatmapStyles,
  toBoundsTuple, boundsOf, padBounds,
} from '../../gis'
import { coordinateOf, viewportForRecords } from '../../gis/gisService'
import { DEPT_STYLES, PROJECT_STATUS_CONFIG } from '../../components/uiStyles'

const SELECTED_ZOOM = 16

// Marker/legend colours come from the GIS module so the map dot, the legend
// swatch and the drawer dot cannot drift apart. Badge classes stay local.
const TYPE_CONFIG = {
  Road:       { dot: PROJECT_TYPE_COLORS.Road,       label: 'Road' },
  Water:      { dot: PROJECT_TYPE_COLORS.Water,      label: 'Water' },
  Electrical: { dot: PROJECT_TYPE_COLORS.Electrical, label: 'Electrical' },
  Sewage:     { dot: PROJECT_TYPE_COLORS.Sewage,     label: 'Sewage' },
  Parks:      { dot: PROJECT_TYPE_COLORS.Parks,      label: 'Parks' },
  Other:      { dot: PROJECT_TYPE_COLORS.Other,      label: 'Other' },
}

// Covers all six backend statuses, so no selection leaves the badge unstyled.
const TYPE_BADGE = {
  Road:       'bg-[#FFF7ED] text-[#C2410C] dark:bg-[#1A0E05] dark:text-[#FB923C]',
  Water:      'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#0A1220] dark:text-[#60A5FA]',
  Sewage:     'bg-[#F5F3FF] text-[#6D28D9] dark:bg-[#130C22] dark:text-[#A78BFA]',
  Electrical: 'bg-[#FEFCE8] text-[#A16207] dark:bg-[#181305] dark:text-[#FACC15]',
  Parks:      'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  Other:      'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]',
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ minWidth: '150px', paddingRight: '32px' }}
      className="h-9 pl-3 text-[13px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#1C1C1F] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function DensitySlider({ label, value, onChange, limits, decimals = 0 }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] w-[48px] flex-shrink-0">{label}</span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-24 accent-[#5E6AD2] cursor-pointer"
      />
      <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] w-[30px] tabular-nums text-right">
        {value.toFixed(decimals)}
      </span>
    </label>
  )
}

function LayerToggle({ label, count, color, active, onClick, loading = false, failed = false }) {
  return (
    <button
      onClick={onClick}
      title={failed ? `${label} could not be loaded` : `Toggle ${label} layer`}
      className={[
        'inline-flex items-center gap-2 h-8 px-3 rounded-[6px] text-[13px] font-medium transition-all',
        active
          ? 'bg-[#FFFFFF] dark:bg-[#27272A] text-[#0F172A] dark:text-[#F8FAFC] shadow-sm'
          : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]',
      ].join(' ')}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: active ? color : 'transparent', border: `1.5px solid ${color}` }}
      />
      {label}
      <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] tabular-nums">
        {failed ? '!' : loading ? '…' : count}
      </span>
    </button>
  )
}

export default function AdminMap() {
  const navigate = useNavigate()
  const { data: projects, loading, error, reload } = useProjects()
  const { data: complaints, loading: loadingComplaints, error: complaintsError } = useComplaints()
  const { data: departments, loading: loadingDepartments, error: departmentsError } = useDepartments()
  const { data: conflicts, loading: loadingConflicts, error: conflictsError } = useConflicts()
  const departmentOptions = useDepartmentOptions()

  const [filterDept,     setFilterDept]     = useState('')
  const [filterType,     setFilterType]     = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)

  // Layer visibility. Each layer mounts independently, so toggling one never
  // touches the other's markers.
  const [showProjects,   setShowProjects]   = useState(true)
  const [showComplaints, setShowComplaints] = useState(false)
  const [filterCategory,       setFilterCategory]       = useState('')
  const [filterComplaintStatus, setFilterComplaintStatus] = useState('')
  const [selectedComplaint, setSelectedComplaint] = useState(null)

  const [showDepartments, setShowDepartments] = useState(false)
  const [showUtilities,   setShowUtilities]   = useState(false)
  const [filterOwner,       setFilterOwner]       = useState('')
  const [filterUtilityType, setFilterUtilityType] = useState('')
  const [selectedAsset, setSelectedAsset] = useState(null)

  const [showConflicts,        setShowConflicts]        = useState(false)
  const [filterSeverity,       setFilterSeverity]       = useState('')
  const [filterConflictType,   setFilterConflictType]   = useState('')
  const [filterConflictStatus, setFilterConflictStatus] = useState('')
  const [selectedConflict, setSelectedConflict] = useState(null)

  const [showHeatmap,      setShowHeatmap]      = useState(false)
  const [heatSource,       setHeatSource]       = useState('complaints')
  const [heatDept,         setHeatDept]         = useState('')
  const [heatRadius,  setHeatRadius]  = useState(heatmapStyles.HEATMAP_DEFAULTS.radius)
  const [heatBlur,    setHeatBlur]    = useState(heatmapStyles.HEATMAP_DEFAULTS.blur)
  const [heatOpacity, setHeatOpacity] = useState(heatmapStyles.HEATMAP_DEFAULTS.opacity)

  const mapRef = useRef(null)
  const handleMapReady = useCallback((map) => { mapRef.current = map }, [])

  // Memoised so the derived map bounds keep a stable identity; otherwise the
  // map would re-fit on every render.
  const visibleProjects = useMemo(() => projects.filter(p => {
    if (filterDept     && p.department !== filterDept)   return false
    if (filterType     && p.type !== filterType)         return false
    if (filterStatus   && p.status !== filterStatus)     return false
    if (filterPriority && p.priority !== filterPriority) return false
    return true
  }), [projects, filterDept, filterType, filterStatus, filterPriority])

  const visibleComplaints = useMemo(() => (complaints || []).filter(c => {
    if (filterCategory        && c.issueType !== filterCategory)      return false
    if (filterComplaintStatus && c.status !== filterComplaintStatus)  return false
    return true
  }), [complaints, filterCategory, filterComplaintStatus])

  // Departments own projects, so the department layer plots the same records
  // through a different lens; the two layers share no state.
  const deptColorIndex = useMemo(
    () => departmentStyles.departmentColorIndex(departments || []),
    [departments]
  )

  const departmentAssets = useMemo(() => projects.filter(p => {
    if (filterOwner && p.department !== filterOwner) return false
    return true
  }), [projects, filterOwner])

  // Utility assets are the utility-type projects that actually carry stored
  // geometry. Records with only a centre point are excluded here rather than
  // silently drawn as an invented corridor.
  const utilityAssets = useMemo(() => projects.filter(p => {
    if (!utilityStyles.isUtilityRecord(p)) return false
    if (filterUtilityType && utilityStyles.utilityTypeOf(p) !== filterUtilityType) return false
    return true
  }), [projects, filterUtilityType])

  const renderableUtilities = useMemo(
    () => utilityAssets.filter(a => !!a._raw?.location?.geoJSON),
    [utilityAssets]
  )

  const visibleConflicts = useMemo(() => (conflicts || []).filter(c => {
    if (filterSeverity       && c.severity !== filterSeverity)          return false
    if (filterConflictStatus && c.status !== filterConflictStatus)      return false
    if (filterConflictType   && !(c.clashTypes || []).includes(filterConflictType)) return false
    return true
  }), [conflicts, filterSeverity, filterConflictStatus, filterConflictType])

  // Only conflicts whose two projects both carry coordinates can be drawn.
  const drawableConflicts = useMemo(
    () => visibleConflicts.filter(c => c.projectACoords && c.projectBCoords),
    [visibleConflicts]
  )

  // Density reuses the records already fetched for the marker layers — no
  // additional request, and no second coordinate resolution path.
  const heatRecords = useMemo(() => {
    const source = heatSource === 'projects' ? (projects || []) : (complaints || [])
    return heatDept ? source.filter(r => r.department === heatDept) : source
  }, [heatSource, projects, complaints, heatDept])

  const heatPlottable = useMemo(
    () => heatRecords.filter(r => !!coordinateOf(r)),
    [heatRecords]
  )

  const hasFilters = filterDept || filterType || filterStatus || filterPriority ||
    filterCategory || filterComplaintStatus || filterOwner || filterUtilityType ||
    filterSeverity || filterConflictType || filterConflictStatus || heatDept

  function clearFilters() {
    setFilterDept('')
    setFilterType('')
    setFilterStatus('')
    setFilterPriority('')
    setFilterCategory('')
    setFilterComplaintStatus('')
    setFilterOwner('')
    setFilterUtilityType('')
    setFilterSeverity('')
    setFilterConflictType('')
    setFilterConflictStatus('')
    setHeatDept('')
    setSelectedProject(null)
    setSelectedComplaint(null)
    setSelectedAsset(null)
    setSelectedConflict(null)
  }

  const selected = selectedProject
    ? projects.find(p => p.id === selectedProject)
    : null

  const selectedStatus = selected ? PROJECT_STATUS_CONFIG[selected.status] : null
  const selectedType   = selected ? TYPE_CONFIG[selected.type]     : null

  const selectedComplaintRecord = selectedComplaint
    ? (complaints || []).find(c => c.id === selectedComplaint)
    : null

  // Auto fit spans whichever layers are switched on, with a conflict
  // contributing both endpoints. The union is computed through the shared GIS
  // service, so neither layer has to know the other exists.
  const conflictPoints = useMemo(
    () => drawableConflicts.flatMap(c => [c.projectACoords, c.projectBCoords]),
    [drawableConflicts]
  )

  const fitRecords = useMemo(() => [
    ...(showUtilities ? renderableUtilities : []),
    ...(showDepartments ? departmentAssets : []),
    ...(showProjects ? visibleProjects : []),
    ...(showComplaints ? visibleComplaints : []),
    ...(showConflicts ? conflictPoints : []),
    ...(showHeatmap ? heatPlottable : []),
  ], [showUtilities, renderableUtilities, showDepartments, departmentAssets,
      showProjects, visibleProjects, showComplaints, visibleComplaints,
      showConflicts, conflictPoints, showHeatmap, heatPlottable])

  const autoBounds = useMemo(() => viewportForRecords(fitRecords), [fitRecords])

  // Selecting a record hands the map a centre/zoom instead of bounds, which is
  // what turns a selection into a zoom-to rather than a re-fit.
  const selectedAssetRecord = selectedAsset
    ? projects.find(p => p.id === selectedAsset)
    : null

  const selectedCoord =
    (selected && coordinateOf(selected)) ||
    (selectedComplaintRecord && coordinateOf(selectedComplaintRecord)) ||
    (selectedAssetRecord && coordinateOf(selectedAssetRecord)) ||
    null

  // Zoom-to-conflict frames BOTH projects rather than one point, so the
  // relationship stays on screen. Padded because two adjacent works would
  // otherwise produce an extreme zoom.
  const selectedConflictRecord = selectedConflict
    ? drawableConflicts.find(c => c.id === selectedConflict)
    : null
  const conflictBounds = useMemo(() => {
    if (!selectedConflictRecord) return null
    const b = boundsOf([selectedConflictRecord.projectACoords, selectedConflictRecord.projectBCoords])
    return b ? padBounds(b, 300) : null
  }, [selectedConflictRecord])

  function resetView() {
    setSelectedProject(null)
    setSelectedComplaint(null)
    setSelectedAsset(null)
    setSelectedConflict(null)
    const tuple = toBoundsTuple(viewportForRecords(fitRecords))
    if (tuple && mapRef.current) {
      mapRef.current.flyToBounds(tuple, { padding: FIT_BOUNDS_PADDING })
    }
  }

  // Selection is mutually exclusive across layers so the map only ever flies to
  // one record; the layers themselves stay unaware of each other.
  function selectProject(id) {
    setSelectedComplaint(null); setSelectedAsset(null)
    setSelectedProject(prev => (prev === id ? null : id))
  }

  function selectComplaint(id) {
    setSelectedProject(null); setSelectedAsset(null)
    setSelectedComplaint(prev => (prev === id ? null : id))
  }

  function selectAsset(id) {
    setSelectedProject(null); setSelectedComplaint(null); setSelectedConflict(null)
    setSelectedAsset(prev => (prev === id ? null : id))
  }

  function selectConflict(id) {
    setSelectedProject(null); setSelectedComplaint(null); setSelectedAsset(null)
    setSelectedConflict(prev => (prev === id ? null : id))
  }

  return (
    <AsyncState loading={loading} error={error} onRetry={reload} label="Loading map data...">
    <div className="flex flex-col gap-4 h-full" style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* Toggles are listed in render order: utilities underneath, complaints
            on top. See LAYER_PANES in gis/config.js. */}
        <div className="flex items-center gap-1 p-0.5 rounded-[8px] bg-[#F1F5F9] dark:bg-[#1A1F2B]">
          <LayerToggle
            label="Utilities"
            count={renderableUtilities.length}
            color={utilityStyles.UTILITY_TYPES.water.color}
            active={showUtilities}
            onClick={() => { setShowUtilities(v => !v); setSelectedAsset(null) }}
          />
          <LayerToggle
            label="Departments"
            count={departmentAssets.length}
            color={departmentStyles.FALLBACK_COLOR}
            active={showDepartments}
            onClick={() => { setShowDepartments(v => !v); setSelectedAsset(null) }}
            loading={loadingDepartments}
            failed={!!departmentsError}
          />
          <LayerToggle
            label="Projects"
            count={visibleProjects.length}
            color={PROJECT_STATUS_COLORS.active}
            active={showProjects}
            onClick={() => { setShowProjects(v => !v); setSelectedProject(null) }}
          />
          <LayerToggle
            label="Complaints"
            count={visibleComplaints.length}
            color={complaintStyles.COMPLAINT_STATUS_COLORS.in_progress}
            active={showComplaints}
            onClick={() => { setShowComplaints(v => !v); setSelectedComplaint(null) }}
            loading={loadingComplaints}
            failed={!!complaintsError}
          />
          <LayerToggle
            label="Conflicts"
            count={drawableConflicts.length}
            color={conflictStyles.CONFLICT_SEVERITY_COLORS.high}
            active={showConflicts}
            onClick={() => { setShowConflicts(v => !v); setSelectedConflict(null) }}
            loading={loadingConflicts}
            failed={!!conflictsError}
          />
          <LayerToggle
            label="Density"
            count={heatPlottable.length}
            color={heatmapStyles.densityColor(1.0)}
            active={showHeatmap}
            onClick={() => setShowHeatmap(v => !v)}
            loading={heatSource === 'projects' ? loading : loadingComplaints}
            failed={heatSource === 'projects' ? !!error : !!complaintsError}
          />
        </div>

        <FilterSelect
          label="Department"
          value={filterDept}
          onChange={v => { setFilterDept(v); setSelectedProject(null) }}
          options={departmentOptions}
        />
        <FilterSelect
          label="Type"
          value={filterType}
          onChange={v => { setFilterType(v); setSelectedProject(null) }}
          options={[
            { value: 'Road',       label: 'Road' },
            { value: 'Water',      label: 'Water' },
            { value: 'Sewage',     label: 'Sewage' },
            { value: 'Electrical', label: 'Electrical' },
            { value: 'Parks',      label: 'Parks' },
          ]}
        />
        <FilterSelect
          label="Status"
          value={filterStatus}
          onChange={v => { setFilterStatus(v); setSelectedProject(null) }}
          options={[
            { value: 'pending',  label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'active',   label: 'Active' },
            { value: 'rejected', label: 'Rejected' },
          ]}
        />
        <FilterSelect
          label="Priority"
          value={filterPriority}
          onChange={v => { setFilterPriority(v); setSelectedProject(null) }}
          options={PROJECT_PRIORITIES.map(p => ({ value: p, label: p }))}
        />

        {showDepartments && (
          <FilterSelect
            label="Owner"
            value={filterOwner}
            onChange={v => { setFilterOwner(v); setSelectedAsset(null) }}
            options={(departments || []).map(d => ({ value: d.code, label: d.code }))}
          />
        )}
        {showUtilities && (
          <FilterSelect
            label="Utility"
            value={filterUtilityType}
            onChange={v => { setFilterUtilityType(v); setSelectedAsset(null) }}
            options={utilityStyles.UTILITY_TYPE_VALUES.map(t => ({
              value: t, label: utilityStyles.utilityTypeLabel(t),
            }))}
          />
        )}

        {showHeatmap && (
          <>
            <FilterSelect
              label="Density of"
              value={heatSource}
              // A source is always required; the select's "All" entry falls
              // back to complaints rather than rendering nothing.
              onChange={v => setHeatSource(v || 'complaints')}
              options={heatmapStyles.HEATMAP_SOURCE_VALUES.map(s => ({
                value: s, label: heatmapStyles.HEATMAP_SOURCES[s],
              }))}
            />
            <FilterSelect
              label="Dept"
              value={heatDept}
              onChange={setHeatDept}
              options={(departments || []).map(d => ({ value: d.code, label: d.code }))}
            />
          </>
        )}

        {showConflicts && (
          <>
            <FilterSelect
              label="Severity"
              value={filterSeverity}
              onChange={v => { setFilterSeverity(v); setSelectedConflict(null) }}
              options={conflictStyles.REACHABLE_SEVERITIES.map(s => ({
                value: s, label: conflictStyles.conflictSeverityLabel(s),
              }))}
            />
            <FilterSelect
              label="Clash"
              value={filterConflictType}
              onChange={v => { setFilterConflictType(v); setSelectedConflict(null) }}
              options={conflictStyles.CONFLICT_TYPE_VALUES.map(t => ({
                value: t, label: conflictStyles.conflictTypeLabel(t),
              }))}
            />
            <FilterSelect
              label="Conflict status"
              value={filterConflictStatus}
              onChange={v => { setFilterConflictStatus(v); setSelectedConflict(null) }}
              options={conflictStyles.CONFLICT_STATUSES.map(s => ({
                value: s, label: conflictStyles.conflictStatusLabel(s),
              }))}
            />
          </>
        )}

        {/* Complaint filters appear only with the layer, so the bar does not
            offer controls that affect nothing on screen. */}
        {showComplaints && (
          <>
            <FilterSelect
              label="Category"
              value={filterCategory}
              onChange={v => { setFilterCategory(v); setSelectedComplaint(null) }}
              options={complaintStyles.COMPLAINT_CATEGORIES.map(c => ({ value: c, label: c }))}
            />
            <FilterSelect
              label="Issue status"
              value={filterComplaintStatus}
              onChange={v => { setFilterComplaintStatus(v); setSelectedComplaint(null) }}
              options={complaintStyles.COMPLAINT_STATUSES.map(s => ({
                value: s, label: complaintStyles.complaintStatusLabel(s),
              }))}
            />
          </>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
            {fitRecords.length} on map
          </span>
          <button onClick={resetView} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
            Reset view
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="text-[13px] text-[#5E6AD2] hover:text-[#4A56C1] font-medium transition-colors">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Narrow viewports stack: below lg the fixed 300px drawer column would
          squeeze the map to zero width. */}
      <div className="flex-1 min-h-0 grid gap-4 grid-cols-1 lg:grid-cols-[1fr_300px]">

        <div
          className="rounded-[8px] bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] flex flex-col overflow-hidden"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="flex-1 relative">
            <MapContainer
              bounds={conflictBounds || (selectedCoord ? undefined : autoBounds)}
              center={conflictBounds ? undefined : (selectedCoord || undefined)}
              zoom={!conflictBounds && selectedCoord ? SELECTED_ZOOM : undefined}
              onReady={handleMapReady}
            >
              {showUtilities && (
                <UtilityLayer
                  assets={renderableUtilities}
                  selectedId={selectedAsset}
                  onSelect={selectAsset}
                />
              )}
              {showDepartments && (
                <DepartmentLayer
                  records={departmentAssets}
                  departments={departments || []}
                  selectedId={selectedAsset}
                  onSelect={selectAsset}
                />
              )}
              {showProjects && (
                <ProjectLayer
                  projects={visibleProjects}
                  selectedId={selectedProject}
                  onSelect={selectProject}
                />
              )}
              {showComplaints && (
                <ComplaintLayer
                  complaints={visibleComplaints}
                  selectedId={selectedComplaint}
                  onSelect={selectComplaint}
                />
              )}
              {showConflicts && (
                <ConflictLayer
                  conflicts={drawableConflicts}
                  selectedId={selectedConflict}
                  onSelect={selectConflict}
                />
              )}
              {showHeatmap && (
                <HeatmapLayer
                  records={heatPlottable}
                  radius={heatRadius}
                  blur={heatBlur}
                  opacity={heatOpacity}
                />
              )}
            </MapContainer>

            {/* Density controls sit over the map so their effect is visible
                while dragging. Purely presentational state — no refetch. */}
            {showHeatmap && (
              <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2 px-3 py-2.5 rounded-[8px] bg-[#FFFFFF]/95 dark:bg-[#1C1C1F]/95 border border-[#E5E5E5] dark:border-[#27272A] shadow-sm">
                <HeatmapLegend />
                <DensitySlider label="Radius"  value={heatRadius}  onChange={setHeatRadius}
                  limits={heatmapStyles.HEATMAP_LIMITS.radius} />
                <DensitySlider label="Blur"    value={heatBlur}    onChange={setHeatBlur}
                  limits={heatmapStyles.HEATMAP_LIMITS.blur} />
                <DensitySlider label="Opacity" value={heatOpacity} onChange={setHeatOpacity}
                  limits={heatmapStyles.HEATMAP_LIMITS.opacity} decimals={2} />
              </div>
            )}

            {/* Overlaid so the map keeps its size and the view is preserved when
                a filter clears the result set. */}
            {fitRecords.length === 0 && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#F8FAFC]/85 dark:bg-[#18181B]/85 pointer-events-none">
                <div className="text-center">
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151] mx-auto mb-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                    <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
                  </svg>
                  <p className="text-[14px] font-medium text-[#9CA3AF] dark:text-[#6B7280]">
                    {!showUtilities && !showDepartments && !showProjects && !showComplaints
                      && !showConflicts && !showHeatmap
                      ? 'No layers enabled'
                      : 'Nothing matches filters'}
                  </p>
                </div>
              </div>
            )}

            {/* Density needs coordinates; a source with none renders an empty
                surface, which is indistinguishable from a broken layer. */}
            {showHeatmap && heatRecords.length > 0 && heatPlottable.length === 0 && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[500]">
                <span className="text-[11px] text-[#92400E] dark:text-[#FACC15] bg-[#FFFBEB] dark:bg-[#181305] px-3 py-1 rounded-full border border-[#FDE68A] dark:border-[#3F2D05]">
                  No {heatmapStyles.HEATMAP_SOURCES[heatSource].toLowerCase()} in this selection have coordinates
                </span>
              </div>
            )}

            {/* Conflicts whose endpoints have no stored coordinates cannot be
                drawn; saying so beats a silently short connector list. */}
            {showConflicts && visibleConflicts.length > drawableConflicts.length && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500]">
                <span className="text-[11px] text-[#92400E] dark:text-[#FACC15] bg-[#FFFBEB] dark:bg-[#181305] px-3 py-1 rounded-full border border-[#FDE68A] dark:border-[#3F2D05]">
                  {visibleConflicts.length - drawableConflicts.length} conflict(s) hidden — endpoint coordinates missing
                </span>
              </div>
            )}

            {/* Utility works that carry no stored geometry cannot be drawn;
                saying so beats an apparently broken layer. */}
            {showUtilities && utilityAssets.length > 0 && renderableUtilities.length === 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
                <span className="text-[11px] text-[#92400E] dark:text-[#FACC15] bg-[#FFFBEB] dark:bg-[#181305] px-3 py-1 rounded-full border border-[#FDE68A] dark:border-[#3F2D05]">
                  {utilityAssets.length} utility {utilityAssets.length === 1 ? 'work has' : 'works have'} no stored geometry
                </span>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 border-t border-[#E5E5E5] dark:border-[#27272A] px-5 py-3 flex items-center gap-5 flex-wrap bg-[#FFFFFF] dark:bg-[#1C1C1F]">
            <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-[#6B7280] uppercase tracking-wide">Legend</span>
            {showUtilities && Object.entries(utilityStyles.UTILITY_TYPES).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-3 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{cfg.label}</span>
              </div>
            ))}
            {showDepartments && (departments || []).map(d => (
              <div key={d.id} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: departmentStyles.departmentColor(d.code, deptColorIndex) }}
                />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{d.code}</span>
              </div>
            ))}
            {showProjects && Object.entries(TYPE_CONFIG).map(([type, config]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.dot }} />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{type}</span>
              </div>
            ))}
            {/* Rounded squares mirror the complaint marker silhouette, so the
                legend distinguishes the two layers the same way the map does. */}
            {showComplaints && Object.entries(complaintStyles.COMPLAINT_CATEGORY_COLORS).map(([category, color]) => (
              <div key={category} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{category}</span>
              </div>
            ))}
            {showProjects && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }} />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">Clash</span>
              </div>
            )}
            {showConflicts && conflictStyles.REACHABLE_SEVERITIES.map(sev => (
              <div key={sev} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-0.5 flex-shrink-0"
                  style={{
                    backgroundImage: `repeating-linear-gradient(90deg, ${conflictStyles.conflictSeverityColor(sev)} 0 3px, transparent 3px 5px)`,
                    height: '2px',
                  }}
                />
                <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
                  {conflictStyles.conflictSeverityLabel(sev)} conflict
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-[8px] bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] flex flex-col overflow-hidden"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A] flex items-center justify-center">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#6B7280] dark:text-[#9CA3AF]">No project selected</p>
                <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] mt-1 leading-relaxed">
                  Click any marker on the map to see project details here
                </p>
              </div>
              <p className="text-[11px] text-[#D1D5DB] dark:text-[#374151]">
                {visibleProjects.length} marker{visibleProjects.length !== 1 ? 's' : ''} visible
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-shrink-0 px-4 py-3 border-b border-[#E5E5E5] dark:border-[#27272A] flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-[0.06em]">
                  Project details
                </p>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="text-[#9CA3AF] hover:text-[#6B7280] dark:hover:text-[#9CA3AF] transition-colors"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: selectedType?.dot || '#6B7280' }} />
                  <h3 className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                    {selected.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${DEPT_STYLES[selected.department] || DEPT_STYLES.PWD}`}>
                    {selected.department}
                  </span>
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[selected.type] || TYPE_BADGE.Other}`}>
                    {selected.type}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${selectedStatus?.bg} ${selectedStatus?.color}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedStatus?.dot }} />
                    {selectedStatus?.text}
                  </span>
                </div>

                <div className="flex flex-col">
                  {[
                    { label: 'Ward',        value: selected.ward },
                    { label: 'Officer',     value: selected.officerName },
                    { label: 'Start date',  value: new Date(selected.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                    { label: 'End date',    value: new Date(selected.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                    { label: 'MCDM Score',  value: `${selected.mcdmScore} / 100` },
                  ].map(row => (
                    <div key={row.label} className="flex items-start justify-between py-2 border-b border-[#F3F4F6] dark:border-[#27272A] last:border-0">
                      <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{row.label}</span>
                      <span className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC] text-right ml-4">{row.value}</span>
                    </div>
                  ))}
                </div>

                {selected.hasClash && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[#FEF2F2] dark:bg-[#1F0A0A] border border-[#FECACA] dark:border-[#7F1D1D]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] flex-shrink-0" style={{ animation: 'civiq-pulse 1.5s ease-in-out infinite' }} />
                    <p className="text-[12px] font-medium text-[#B91C1C] dark:text-[#F87171]">Clash detected</p>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 p-4 border-t border-[#E5E5E5] dark:border-[#27272A]">
                <button
                  onClick={() => navigate(`/admin/projects/${selected.id}`)}
                  className="w-full h-9 flex items-center justify-center gap-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors"
                >
                  View full project
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
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