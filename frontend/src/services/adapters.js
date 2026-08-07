// Maps backend models to frontend view models. Field names, enum casing and the
// conflict vocabulary all differ from what the screens consume, so every entity
// is projected here rather than in the JSX.

// Fields the UI renders that have no backend source; adapters emit null/false
// for these rather than fabricating a value.
export const UNAVAILABLE_FIELDS = {
  project: ["approvedAt"],
  complaint: ["acknowledgedAt", "resolvedAt", "overdue"],
  auditLog: ["resourceTitle", "description"],
}

const id = (v) => (v && typeof v === "object" ? v._id : v) || null

export function initialsOf(name) {
  if (!name) return "?"
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// Presentational label derived from the role the backend already stores.
const ROLE_LABELS = {
  admin: "Municipal Coordinator",
  officer: "Executive Engineer",
  supervisor: "Junior Engineer",
  citizen: "Citizen",
}
export const roleLabel = (role) => ROLE_LABELS[role] || role || ""

// Backend projectType enum -> the Title Case labels the UI styles by.
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

// Backend conflict vocabulary -> the vocabulary the existing screens style by.
const CONFLICT_STATUS = {
  pending: "unresolved",
  awaiting_officer: "pending_response",
  resolved_both: "resolved",
  resolved_rejected: "resolved",
}
const CONFLICT_SEVERITY = { incompatible: "high", conditional: "medium" }

// Project.mcdmScore is stored on the engine's 0–10 scale; screens display the
// 0–100 scale the engine reports as `outOf100`. Only the create response carries
// that field, so reads convert here, once, at the contract boundary.
const scoreOutOf100 = (score) => (Number.isFinite(score) ? Math.round(score * 10) : null)

// Per-criterion scores stay on their own 0–10 scale, which is what the
// breakdown bars represent. Absent when the project predates mcdmBreakdown.
const breakdownOf = (breakdown) =>
  breakdown && typeof breakdown === "object" ? breakdown : null

// Mirrors the comparison in conflictsController.resolveConflict, which scores a
// missing value as -Infinity so an unscored project always yields.
const rankScore = (score) => (Number.isFinite(score) ? score : -Infinity)

// Build an id -> department lookup so ObjectId references can be shown as codes.
export function departmentIndex(departments = []) {
  const map = new Map()
  for (const d of departments) map.set(String(d._id), d)
  return map
}

// A department reference may arrive populated ({_id,name,code}) or as a bare
// id string, depending on the endpoint. Resolve either through the index.
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
    // Backend enum is standalone | phase1 | continuation; screens test "phased".
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
    // No backend equivalent — see UNAVAILABLE_FIELDS.
    approvedAt: null,
    rejectionReason: p.rejectionReason || null,
    suggestedDate: p.suggestedDate || null,
    _raw: p,
  }
}


// Normalize the public project response for the Citizen UI.
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

// Kept local to the adapter so services stay free of GIS imports; returns null
// for absent or out-of-range coordinates rather than a partial object.
function normalizeCoords(coords) {
  const lat = coords?.lat
  const lng = coords?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

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
    // Which side the backend keeps for `reject_lower`: resolveConflict defers
    // the lower mcdmScore, treats a non-finite score as lowest, and keeps
    // project1 on a tie. The two sides carry no precedence of their own.
    higherPriorityId: rankScore(A?.mcdmScore) >= rankScore(B?.mcdmScore)
      ? id(c.project1)
      : id(c.project2),
    // Real stored coordinates for each side. Null when the endpoint has none —
    // the conflict layer omits rendering rather than inventing a position.
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
    // No backend equivalent — see UNAVAILABLE_FIELDS.
    acknowledgedAt: null,
    resolvedAt: c.status === "resolved" ? c.updatedAt : null,
    resolutionNote: c.resolutionNote || null,
    photos: c.photoUrl ? [c.photoUrl] : [],
    overdue: false,
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
    // performedBy.department is a Department id stored as a String, resolved
    // through the same index as every other reference.
    department: resolveDept(by?.department, deptMap).code,
    action: a.action,
    resourceType: a.targetType || null,
    resourceId: a.targetId || null,
    // No human-readable title is stored; fall back to whatever detail exists.
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
    // Absent on notifications written before these were derived from the type.
    category: n.category || null,
    priority: n.priority || null,
    createdAt: n.createdAt,
    _raw: n,
  }
}

export function adaptDepartment(d) {
  if (!d) return null
  return { id: d._id, name: d.name, code: d.code, description: d.description || null, color: d.color, isActive: d.isActive, createdAt: d.createdAt, _raw: d }
}
