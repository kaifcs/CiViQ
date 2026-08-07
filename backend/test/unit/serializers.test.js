// Conflict payload redaction. A conflict embeds two projects, so without this
// its payload is a way around project ownership. Both halves are asserted: an
// unauthorized project collapses to a bare id, an authorized one is untouched.

const test = require("node:test")
const assert = require("node:assert/strict")
const { asUser, oid } = require("../helpers/fixtures")
const {
  redactProjectRef, serialiseConflict, serialiseConflicts, serialisePublicProject,
} = require("../../src/utils/serializers")

const populatedProject = (overrides = {}) => ({
  _id: oid(),
  title: "Sector 5 resurfacing",
  mcdmScore: 87.5,
  department: oid(),
  projectType: "road",
  location: { ward: "Ward-1", centerCoords: { lat: 28.6, lng: 77.4 } },
  ...overrides,
})

// The fields that must never reach an unauthorized viewer. Which projects clash
// is not the secret; their titles, scores and coordinates are.
const SENSITIVE = ["title", "mcdmScore", "department", "projectType", "location"]

test("an unauthorized project collapses to its id", () => {
  const project = populatedProject({ officer: oid() })
  const result = redactProjectRef(project, asUser("officer"))
  assert.equal(String(result), String(project._id))
  assert.equal(typeof result, "object", "the reference survives so the conflict stays coherent")
  for (const field of SENSITIVE) {
    assert.equal(result[field], undefined, `${field} leaked`)
  }
})

test("an authorized project is returned untouched", () => {
  const mine = oid()
  const project = populatedProject({ officer: mine })
  const result = redactProjectRef(project, asUser("officer", mine))
  assert.equal(result, project, "the same object, not a copy")
  assert.equal(result.title, "Sector 5 resurfacing")
})

test("admins see both sides in full", () => {
  const conflict = {
    _id: oid(), status: "pending", severity: "incompatible",
    project1: populatedProject({ officer: oid() }),
    project2: populatedProject({ officer: oid() }),
  }
  const result = serialiseConflict(conflict, asUser("admin"))
  assert.equal(result.project1.title, "Sector 5 resurfacing")
  assert.equal(result.project2.title, "Sector 5 resurfacing")
})

// An officer owning one side of a conflict must see their own project, and only
// an id for the other.
test("mixed ownership redacts only the side the viewer does not own", () => {
  const mine = oid()
  const theirs = populatedProject({ officer: oid(), title: "Not mine" })
  const conflict = {
    _id: oid(), status: "pending",
    project1: populatedProject({ officer: mine, title: "Mine" }),
    project2: theirs,
  }
  const result = serialiseConflict(conflict, asUser("officer", mine))
  assert.equal(result.project1.title, "Mine")
  assert.equal(String(result.project2), String(theirs._id))
  assert.equal(result.project2.title, undefined)
})

test("conflict metadata survives redaction", () => {
  const conflict = {
    _id: oid(), status: "awaiting_officer", severity: "conditional",
    clashTypes: ["geographic", "timeline"],
    project1: populatedProject({ officer: oid() }),
    project2: populatedProject({ officer: oid() }),
  }
  const result = serialiseConflict(conflict, asUser("officer"))
  assert.equal(result.status, "awaiting_officer")
  assert.equal(result.severity, "conditional")
  assert.deepEqual(result.clashTypes, ["geographic", "timeline"])
})

test("an already-unpopulated reference passes through unchanged", () => {
  const id = oid()
  assert.equal(redactProjectRef(id, asUser("officer")), id)
  assert.equal(redactProjectRef(null, asUser("admin")), null)
  assert.equal(redactProjectRef(undefined, asUser("admin")), undefined)
})

test("serialiseConflict accepts a hydrated document and always returns a plain object", () => {
  const plain = { _id: oid(), status: "pending", project1: null, project2: null }
  const hydrated = { ...plain, toObject: () => ({ ...plain }) }
  const result = serialiseConflict(hydrated, asUser("admin"))
  assert.equal(result.toObject, undefined, "the mongoose surface must not survive")
  assert.equal(result.status, "pending")
})

test("serialiseConflicts maps a list and tolerates an empty or absent one", () => {
  const mine = oid()
  const list = [
    { _id: oid(), project1: populatedProject({ officer: mine }), project2: populatedProject({ officer: oid() }) },
    { _id: oid(), project1: populatedProject({ officer: oid() }), project2: populatedProject({ officer: mine }) },
  ]
  const result = serialiseConflicts(list, asUser("officer", mine))
  assert.equal(result.length, 2)
  assert.equal(result[0].project1.title, "Sector 5 resurfacing")
  assert.equal(result[0].project2.title, undefined)
  assert.equal(result[1].project1.title, undefined)
  assert.equal(result[1].project2.title, "Sector 5 resurfacing")

  assert.deepEqual(serialiseConflicts([], asUser("admin")), [])
  assert.deepEqual(serialiseConflicts(null, asUser("admin")), [])
})

// The transparency portal's payload is whitelisted, so it is pinned to
// exactly what a citizen may see — nothing staff-only slips through.
test("serialisePublicProject exposes only the public fields", () => {
  const project = {
    _id: oid(),
    title: "Sector 5 resurfacing",
    description: "Resurfacing works",
    department: { _id: oid(), code: "PWD", name: "Public Works" },
    projectType: "road",
    status: "active",
    progress: 40,
    startDate: new Date("2025-01-01"),
    endDate: new Date("2025-06-01"),
    location: { ward: "Ward-1", address: "Main Rd", centerCoords: { lat: 28.6, lng: 77.4 } },
    officer: oid(),
    supervisor: oid(),
    mcdmScore: 87.5,
    mcdmBreakdown: { conditionSeverity: 8 },
    hasClash: true,
    adminNote: "internal note",
    rejectionReason: null,
    tenderNumber: "T-100",
    contractorName: "Acme",
    createdBy: oid(),
  }
  const result = serialisePublicProject(project)
  assert.equal(result.title, "Sector 5 resurfacing")
  assert.equal(result.department.code, "PWD")
  assert.equal(result.location.ward, "Ward-1")
  for (const field of [
    "officer", "supervisor", "mcdmScore", "mcdmBreakdown", "hasClash",
    "adminNote", "rejectionReason", "tenderNumber", "contractorName", "createdBy", "projectId",
  ]) {
    assert.equal(result[field], undefined, `${field} leaked into the public payload`)
  }
})

test("serialisePublicProject accepts a hydrated document and tolerates a null input", () => {
  const plain = { _id: oid(), title: "x", location: {} }
  const hydrated = { ...plain, toObject: () => ({ ...plain }) }
  const result = serialisePublicProject(hydrated)
  assert.equal(result.toObject, undefined)
  assert.equal(result.title, "x")
  assert.equal(serialisePublicProject(null), null)
})

test("the source conflict is not mutated by redaction", () => {
  const conflict = {
    _id: oid(),
    project1: populatedProject({ officer: oid(), title: "Original" }),
    project2: populatedProject({ officer: oid() }),
  }
  serialiseConflict(conflict, asUser("officer"))
  assert.equal(conflict.project1.title, "Original", "redaction must not damage the caller's document")
})
