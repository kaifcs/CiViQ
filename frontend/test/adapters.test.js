// Adapters — the backend/frontend contract boundary. Every screen reads adapted
// view models, so a field with no backend source must stay null or false, and a
// redacted project reference must degrade to "details unavailable".

import test from "node:test"
import assert from "node:assert/strict"

import {
  UNAVAILABLE_FIELDS, PROJECT_TYPE_VALUE, initialsOf, roleLabel, departmentIndex,
  adaptUser, adaptProject, adaptConflict, adaptComplaint, adaptNotification,
  adaptDepartment, adaptAuditLog,
} from "../src/services/adapters.js"

const DEPARTMENTS = [
  { _id: "d1", name: "Public Works", code: "PWD" },
  { _id: "d2", name: "Water Supply", code: "WSD" },
]
const deptMap = departmentIndex(DEPARTMENTS)

test("every adapter maps absent input to null rather than throwing", () => {
  const adapters = {
    adaptUser, adaptProject, adaptConflict, adaptComplaint,
    adaptNotification, adaptDepartment, adaptAuditLog,
  }
  for (const [name, adapt] of Object.entries(adapters)) {
    assert.equal(adapt(null, deptMap), null, `${name}(null)`)
    assert.equal(adapt(undefined, deptMap), null, `${name}(undefined)`)
  }
})

test("initials handle one, several and absent names", () => {
  assert.equal(initialsOf("Asha Verma"), "AV")
  assert.equal(initialsOf("Asha"), "A")
  assert.equal(initialsOf("Asha Kumari Verma"), "AK")
  assert.equal(initialsOf(""), "?")
  assert.equal(initialsOf(null), "?")
})

test("an unknown role falls back to the raw value rather than blank", () => {
  assert.equal(roleLabel("officer"), "Executive Engineer")
  assert.equal(roleLabel("newrole"), "newrole")
  assert.equal(roleLabel(undefined), "")
})

// The type map is reversed for form submission; a mismatch would silently post
// a label where the backend enum is required.
test("project type labels reverse-map to backend enum values", () => {
  assert.equal(PROJECT_TYPE_VALUE.Road, "road")
  assert.equal(PROJECT_TYPE_VALUE.Electrical, "electricity")
  assert.equal(PROJECT_TYPE_VALUE.Parks, "parks")
})

test("a department reference resolves whether populated or a bare id", () => {
  const populated = adaptProject({ _id: "p1", department: { _id: "d1", name: "Public Works", code: "PWD" } }, deptMap)
  const byId = adaptProject({ _id: "p2", department: "d1" }, deptMap)
  assert.equal(populated.department, "PWD")
  assert.equal(byId.department, "PWD")
})

test("an unresolvable department yields null rather than a placeholder code", () => {
  const project = adaptProject({ _id: "p3", department: "unknown-id" }, deptMap)
  assert.equal(project.department, null)
  assert.notEqual(project.department, "unknown-id")
})

test("fields with no backend source are declared and emitted as null", () => {
  assert.ok(Array.isArray(UNAVAILABLE_FIELDS.project))
  const project = adaptProject({ _id: "p1", title: "T" }, deptMap)
  for (const field of UNAVAILABLE_FIELDS.project) {
    assert.equal(project[field], null, `${field} must not be fabricated`)
  }
  const complaint = adaptComplaint({ _id: "c1" }, deptMap)
  for (const field of UNAVAILABLE_FIELDS.complaint) {
    assert.ok(complaint[field] === null || complaint[field] === false,
      `${field} must not be fabricated (got ${complaint[field]})`)
  }
})

// PUT /api/projects/:id/progress answers with an unpopulated project, unlike GET
// /api/projects/:id. SupervisorTaskDetail merges only the fields that endpoint
// owns; this pins the asymmetry that makes the merge necessary.
test("an unpopulated project reference yields no officer name (progress response shape)", () => {
  const populated = adaptProject(
    { _id: "p1", title: "T", officer: { _id: "u1", fullName: "Amit Sharma" }, department: "d1" },
    deptMap
  )
  assert.equal(populated.officerName, "Amit Sharma")
  assert.equal(populated.departmentFull, "Public Works")

  // The shape the progress endpoint actually returns: bare ObjectId references.
  const fromProgressWrite = adaptProject(
    { _id: "p1", title: "T", officer: "u1", department: "d1", progress: 100, status: "completed" },
    deptMap
  )
  assert.equal(fromProgressWrite.progress, 100, "progress is authoritative from the write")
  assert.equal(fromProgressWrite.status, "completed", "status is authoritative from the write")
  assert.equal(fromProgressWrite.officerName, null, "a bare reference carries no name to render")
  assert.equal(String(fromProgressWrite.officerId), "u1", "the reference itself survives")
})

// The backend conflict vocabulary differs from what the screens style by.
test("conflict status and severity map to the UI vocabulary", () => {
  const status = {
    pending: "unresolved",
    awaiting_officer: "pending_response",
    resolved_both: "resolved",
    resolved_rejected: "resolved",
  }
  for (const [backend, ui] of Object.entries(status)) {
    assert.equal(adaptConflict({ _id: "x", status: backend }, deptMap).status, ui)
  }
  assert.equal(adaptConflict({ _id: "x", severity: "incompatible" }, deptMap).severity, "high")
  assert.equal(adaptConflict({ _id: "x", severity: "conditional" }, deptMap).severity, "medium")
})

test("an unknown conflict status falls back rather than rendering blank", () => {
  const adapted = adaptConflict({ _id: "x", status: "brand_new_status" }, deptMap)
  assert.equal(adapted.status, "unresolved")
  assert.equal(adapted.severity, "medium")
})

// When a viewer is not authorized to see one side of a conflict, the backend
// collapses that project to a bare id. The adapter must keep the conflict
// coherent and report the details as unavailable.
test("regression: a redacted project reference degrades to details-unavailable (S2.5)", () => {
  const conflict = {
    _id: "c1",
    status: "pending",
    severity: "incompatible",
    clashTypes: ["geographic", "timeline"],
    // mcdmScore is stored on the engine's 0–10 scale; the adapter reports the
    // 0–100 form the screens display.
    project1: { _id: "p1", title: "Mine", mcdmScore: 8.2, department: "d1",
      location: { ward: "Ward-3", centerCoords: { lat: 28.6, lng: 77.4 } } },
    // Redacted: a bare id, exactly as serialiseConflict emits it.
    project2: "p2",
  }
  const adapted = adaptConflict(conflict, deptMap)

  // The conflict itself stays usable.
  assert.equal(adapted.id, "c1")
  assert.equal(adapted.status, "unresolved")
  assert.equal(adapted.severity, "high")
  assert.equal(adapted.projectBId, "p2", "the reference must survive")

  // Nothing about the hidden project is invented.
  assert.equal(adapted.projectBTitle, null)
  assert.equal(adapted.projectBScore, null)
  assert.equal(adapted.projectBDept, null)
  assert.equal(adapted.projectBCoords, null)

  // The visible side is unaffected.
  assert.equal(adapted.projectATitle, "Mine")
  assert.equal(adapted.projectAScore, 82)
  assert.equal(adapted.projectADept, "PWD")
})

test("a conflict with both sides redacted still renders a description", () => {
  const adapted = adaptConflict({ _id: "c2", project1: "p1", project2: "p2", clashTypes: [] }, deptMap)
  assert.equal(adapted.projectATitle, null)
  assert.equal(adapted.projectBTitle, null)
  assert.ok(adapted.overlapDescription, "the screens always render a description")
  assert.equal(adapted.projectAId, "p1")
})

test("conflict coordinates are null when unavailable, never a default point", () => {
  const adapted = adaptConflict({
    _id: "c3",
    project1: { _id: "p1", title: "A" },
    project2: { _id: "p2", title: "B", location: { centerCoords: { lat: 28.6, lng: 77.4 } } },
  }, deptMap)
  assert.equal(adapted.projectACoords, null, "a missing position must not become 0,0")
  assert.deepEqual(adapted.projectBCoords, { lat: 28.6, lng: 77.4 })
})

test("notifications adapt to the shape the context stores", () => {
  const adapted = adaptNotification({
    _id: "n1", recipient: { _id: "u1" }, type: "project_approved",
    title: "Approved", message: "Your project was approved",
    read: false, archived: false, category: "project", priority: "normal",
    createdAt: "2026-01-01T00:00:00.000Z",
  })
  assert.equal(adapted.id, "n1")
  assert.equal(adapted.recipientId, "u1")
  assert.equal(adapted.read, false)
  assert.equal(adapted.archived, false)
  assert.equal(adapted.category, "project")
  assert.equal(adapted.link, null)
})

// Rows written before category and priority were derived from the type have
// neither; they must still appear in the feed.
test("a notification predating derived metadata still adapts", () => {
  const adapted = adaptNotification({ _id: "n2", type: "project_approved", title: "T", message: "M" })
  assert.equal(adapted.category, null)
  assert.equal(adapted.priority, null)
  assert.equal(adapted.read, false, "absent read state must be false, not undefined")
  assert.equal(adapted.archived, false)
})

test("read and archived flags are always booleans", () => {
  const adapted = adaptNotification({ _id: "n3", read: 1, archived: "yes" })
  assert.equal(adapted.read, true)
  assert.equal(adapted.archived, true)
  assert.equal(typeof adapted.read, "boolean")
})

test("adapters carry the raw document for callers that need the original", () => {
  const raw = { _id: "n1", type: "project_approved", title: "T", message: "M" }
  assert.equal(adaptNotification(raw)._raw, raw)
})

test("a user payload never exposes a password field", () => {
  const adapted = adaptUser(
    { _id: "u1", fullName: "Asha Verma", email: "a@civiq.test", role: "officer", department: "d1" },
    deptMap
  )
  assert.equal(adapted.password, undefined)
  assert.equal(JSON.stringify(adapted).includes("password"), false)
  assert.equal(adapted.department, "PWD")
})
