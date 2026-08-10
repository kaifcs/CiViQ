// Maps backend models to frontend view models.


// UI fields with no backend source.
export const UNAVAILABLE_FIELDS = {
  project: ["approvedAt"],
  complaint: ["acknowledgedAt"],
  auditLog: ["resourceTitle", "description"],
}

const id = (v) => (v && typeof v === "object" ? v._id : v) || null

export function initialsOf(name) {
  if (!name) return "?"
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// Role labels mirror the backend role enum.
const ROLE_LABELS = {
  admin: "Municipal Coordinator",
  officer: "Executive Engineer",
  supervisor: "Junior Engineer",
}

export const roleLabel = (role) => ROLE_LABELS[role] || role || ""

// Roles available to administrators.
export const ROLES = Object.keys(ROLE_LABELS)

// Backend projectType -> UI label.
const PROJECT_TYPE_LABEL = {
  road: "Road", water: "Water", sewage: "Sewage",
  electricity: "Electrical", parks: "Parks", other: "Other",
}

export const PROJECT_TYPE_VALUE = Object.fromEntries(
  Object.entries(PROJECT_TYPE_LABEL).map(([k, v]) => [v, k])
)

const ISSUE_TYPE_LABEL = {
  pothole: "Pothole", streetlight: "Streetlight", water_leak: "Water Leak",
  garbage: "Garbage", drainage: "Drainage", other: "Other",
}

// The complaint intake form's options. Values are the backend enum exactly, so
// the form cannot offer an issue type the API would reject.
export const ISSUE_TYPE_OPTIONS = Object.entries(ISSUE_TYPE_LABEL).map(
  ([value, label]) => ({ value, label })
)

// Mirrors the backend's public project filter, so the portal never presents a
// status GET /projects/public cannot return.
export const PUBLIC_PROJECT_STATUSES = ["approved", "active", "completed", "rescheduled"]

// Backend conflict status -> UI status.
const CONFLICT_STATUS = {
  pending: "unresolved",
  awaiting_officer: "pending_response",
  resolved_both: "resolved",
  resolved_rejected: "resolved",
}

const CONFLICT_SEVERITY = { incompatible: "high", conditional: "medium" }

// Backend score is 0–10; UI uses 0–100.
const scoreOutOf100 = (score) => (Number.isFinite(score) ? Math.round(score * 10) : null)

// Per-criterion scores remain 0–10.
const breakdownOf = (breakdown) =>
  breakdown && typeof breakdown === "object" ? breakdown : null

// Higher score wins; missing scores rank lowest.
const rankScore = (score) => (Number.isFinite(score) ? score : -Infinity)

// Build a department lookup by ID.
export function departmentIndex(departments = []) {
  const map = new Map()
  for (const d of departments) map.set(String(d._id), d)
  return map
}

// Resolve populated department objects or IDs.
function resolveDept(ref, deptMap) {
  if (ref && typeof ref === "object" && ref.code) return { code: ref.code, name: ref.name }
  const hit = deptMap?.get(String(ref))
  return hit ? { code: hit.code, name: hit.name } : { code: null, name: null }
}

export function adaptUser(u, deptMap) {
  if (!u) return null
  const dept = resolveDept(u.department, deptMap)
  return {
    id: u._id,
    name: u.fullName,
    email: u.email,
    role: u.role,
    roleLabel: roleLabel(u.role),
    department: dept.code,
    departmentFull: dept.name,
    initials: initialsOf(u.fullName),
    status: u.isActive ? "active" : "inactive",
    lastActive: u.lastLogin || null,
    createdAt: u.createdAt,
    phone: u.phone || null,
    avatar: u.avatar || null,
    _raw: u,
  }
}

export function adaptProject(p, deptMap) {
  if (!p) return null
  const dept = resolveDept(p.department, deptMap)
  const loc = p.location || {}
  const coords = loc.centerCoords || {}
  const officer = p.officer && typeof p.officer === "object" ? p.officer : null
  const supervisor = p.supervisor && typeof p.supervisor === "object" ? p.supervisor : null
  return {
    id: p._id,
    projectId: p.projectId,
    title: p.title,
    description: p.description,
    department: dept.code,
    departmentFull: dept.name,
    officerId: id(p.officer),
    officerName: officer?.fullName || null,
    supervisorId: id(p.supervisor),
    supervisorName: supervisor?.fullName || null,
    type: PROJECT_TYPE_LABEL[p.projectType] || "Other",
    status: p.status,
    priority: p.priority,
    phase: p.phase === "phase1" ? "phased" : p.phase,
    ward: loc.ward || null,
    zone: loc.zone || null,
    address: loc.address || null,
    centerLat: coords.lat ?? null,
    centerLng: coords.lng ?? null,
    startDate: p.startDate,
    endDate: p.endDate,
    estimatedCost: p.estimatedCost ?? null,
    budgetSource: p.budgetSource || null,
    tenderNumber: p.tenderNumber || null,
    contractorName: p.contractorName || null,
    contractorFirm: p.contractorFirm || null,
    mcdmScore: scoreOutOf100(p.mcdmScore),
    mcdmBreakdown: breakdownOf(p.mcdmBreakdown),
    hasClash: !!p.hasClash,
    progress: p.progress ?? 0,
    isActive: p.isActive !== false,
    submittedAt: p.createdAt,
    approvedAt: null,
    rejectionReason: p.rejectionReason || null,
    suggestedDate: p.suggestedDate || null,
    _raw: p,
  }
}

// Normalize the public project response.
export function adaptPublicProject(p) {
  if (!p) return null
  const loc = p.location || {}
  const coords = loc.centerCoords || {}
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    department: p.department?.code || null,
    departmentFull: p.department?.name || null,
    type: PROJECT_TYPE_LABEL[p.projectType] || "Other",
    status: p.status,
    progress: p.progress ?? 0,
    ward: loc.ward || null,
    zone: loc.zone || null,
    address: loc.address || null,
    city: loc.city || null,
    centerLat: coords.lat ?? null,
    centerLng: coords.lng ?? null,
    startDate: p.startDate,
    endDate: p.endDate,
    actualEndDate: p.actualEndDate || null,
  }
}

// Return valid coordinates or null.
function normalizeCoords(coords) {
  const lat = coords?.lat
  const lng = coords?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

// Calculate overlapping project days.
function overlapDays(a, b) {
  if (!a?.startDate || !a?.endDate || !b?.startDate || !b?.endDate) return 0
  const start = Math.max(new Date(a.startDate), new Date(b.startDate))
  const end = Math.min(new Date(a.endDate), new Date(b.endDate))
  const days = Math.ceil((end - start) / 86400000)
  return days > 0 ? days : 0
}

export function adaptConflict(c, deptMap) {
  if (!c) return null
  const A = c.project1 && typeof c.project1 === "object" ? c.project1 : null
  const B = c.project2 && typeof c.project2 === "object" ? c.project2 : null
  const dA = resolveDept(A?.department, deptMap)
  const dB = resolveDept(B?.department, deptMap)
  const ward = A?.location?.ward || B?.location?.ward || null
  const kinds = (c.clashTypes || []).join(", ")
  const res = c.adminResolution || {}

  return {
    id: c._id,
    projectAId: id(c.project1),
    projectBId: id(c.project2),
    projectATitle: A?.title || null,
    projectBTitle: B?.title || null,
    projectADept: dA.code,
    projectBDept: dB.code,
    projectAScore: scoreOutOf100(A?.mcdmScore),
    projectBScore: scoreOutOf100(B?.mcdmScore),
    projectABreakdown: breakdownOf(A?.mcdmBreakdown),
    projectBBreakdown: breakdownOf(B?.mcdmBreakdown),
    // Higher score wins; ties keep project1.
    higherPriorityId: rankScore(A?.mcdmScore) >= rankScore(B?.mcdmScore)
      ? id(c.project1)
      : id(c.project2),
    // Use stored coordinates only.
    projectACoords: normalizeCoords(A?.location?.centerCoords),
    projectBCoords: normalizeCoords(B?.location?.centerCoords),
    clashTypes: c.clashTypes || [],
    suggestedDate: c.suggestedDate || null,
    updatedAt: c.updatedAt || null,
    overlapDescription: kinds
      ? `${kinds} overlap${ward ? ` in ${ward}` : ""}`
      : ward ? `Overlap in ${ward}` : "Overlapping works",
    overlapDays: overlapDays(A, B),
    status: CONFLICT_STATUS[c.status] || "unresolved",
    severity: CONFLICT_SEVERITY[c.severity] || "medium",
    detectedAt: c.createdAt,
    adminNote: res.coordinationNote || res.overrideReason || null,
    resolution: res.action
      ? {
          type: res.action,
          rejectedProjectId: id(c.rescheduledProject),
          suggestedDate: c.suggestedDate || null,
          resolvedAt: res.resolvedAt || null,
          resolvedBy: res.resolvedBy || null,
          coordinationNote: res.coordinationNote || null,
        }
      : null,
    _raw: c,
  }
}

export function adaptComplaint(c, deptMap) {
  if (!c) return null
  const loc = c.location || {}
  const coords = loc.coords || {}
  const dept = resolveDept(c.assignedDepartment, deptMap)
  return {
    id: c._id,
    cnrId: c.cnrId,
    issueType: ISSUE_TYPE_LABEL[c.issueType] || "Other",
    department: dept.code || "Other",
    description: c.description,
    address: loc.address || null,
    ward: loc.ward || null,
    lat: coords.lat ?? null,
    lng: coords.lng ?? null,
    status: c.status,
    assignedOfficer: id(c.assignedOfficer),
    filedAt: c.createdAt,
    acknowledgedAt: null,
    // No deadline exists in the complaint schema.
    updatedAt: c.updatedAt,
    resolvedAt: c.status === "resolved" ? c.updatedAt : null,
    resolutionNote: c.resolutionNote || null,
    _raw: c,
  }
}

export function adaptAuditLog(a, deptMap) {
  if (!a) return null
  const by = a.performedBy && typeof a.performedBy === "object" ? a.performedBy : null
  const d = a.details || {}
  return {
    id: a._id,
    userId: id(a.performedBy),
    userName: by?.fullName || "System",
    userRole: by?.role || null,
    department: resolveDept(by?.department, deptMap).code,
    action: a.action,
    resourceType: a.targetType || null,
    resourceId: a.targetId || null,
    resourceTitle: d.cnrId || d.reason || d.status || "",
    description: "",
    isOverride: !!a.isOverride,
    ipAddress: a.ipAddress || null,
    timestamp: a.createdAt,
    _raw: a,
  }
}

export function adaptNotification(n) {
  if (!n) return null
  return {
    id: n._id,
    recipientId: id(n.recipient),
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link || null,
    read: !!n.read,
    readAt: n.readAt || null,
    archived: !!n.archived,
    category: n.category || null,
    priority: n.priority || null,
    createdAt: n.createdAt,
    _raw: n,
  }
}

export function adaptDepartment(d) {
  if (!d) return null
  return {
    id: d._id,
    name: d.name,
    code: d.code,
    description: d.description || null,
    color: d.color,
    isActive: d.isActive,
    createdAt: d.createdAt,
    _raw: d,
  }
}

// Translate the project wizard's flat form state into the backend schema.
export function buildProjectPayload(form) {
  return {
    title: form.title,
    department: form.departmentId,
    projectType: PROJECT_TYPE_VALUE[form.type] || "other",
    description: form.description,
    phase: form.phase === "phased" ? "phase1" : form.phase === "continue" ? "continuation" : "standalone",
    startDate: form.startDate,
    endDate: form.endDate,
    estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
    budgetSource: form.budgetSource,
    tenderNumber: form.tenderNumber,
    contractorName: form.contractorName,
    contractorFirm: form.contractorFirm,
    supervisor: form.supervisorId || undefined,
    location: {
      ward: form.ward,
      address: form.address,
      centerCoords: { lat: Number(form.lat), lng: Number(form.lng) },
      // Omitted entirely when nothing was drawn, so a project without a shape
      // stores no geometry rather than an empty object the GIS layer would
      // then have to guard against. `location` is whitelisted as a whole, so
      // this reaches the document exactly as built by gis/geojson.js.
      ...(form.geoJSON ? { geoJSON: form.geoJSON } : {}),
    },
    mcdmInputs: {
      conditionRating: form.conditionRating,
      incidents: form.incidents || [],
      lastWorkYear: form.lastWorkYear ? Number(form.lastWorkYear) : undefined,
      tenderStatus: form.tenderStatus,
      contractorAssigned: form.contractorAssigned === "yes",
      roadClosure: form.roadClosure,
      utilityDisruption: form.utilities || [],
      disruptionDays: form.disruptionDays ? Number(form.disruptionDays) : undefined,
    },
  }
}
