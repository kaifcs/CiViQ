// Resource-level authorization. The rule lives in one place so the list and the
// single-resource routes cannot drift apart; these pin it in both forms callers
// use — a Mongo filter fragment, and a decision on a loaded document.

const test = require("node:test")
const assert = require("node:assert/strict")
const { asUser, oid } = require("../helpers/fixtures")
const { projectScopeFilter, canAccessProject } = require("../../src/middleware/ownership")

test("projectScopeFilter narrows officers to the projects they own", () => {
  const user = asUser("officer")
  assert.deepEqual(projectScopeFilter(user), { officer: user._id })
})

test("projectScopeFilter narrows supervisors to the projects they supervise", () => {
  const user = asUser("supervisor")
  assert.deepEqual(projectScopeFilter(user), { supervisor: user._id })
})

test("projectScopeFilter leaves admins unrestricted", () => {
  assert.deepEqual(projectScopeFilter(asUser("admin")), {})
})

// An empty filter means "everything". Any role that reaches this function
// without being handled must not silently receive an admin-wide scope by
// accident — so the roles that DO get an empty filter are pinned explicitly.
test("only admin receives an unrestricted filter", () => {
  for (const role of ["officer", "supervisor", "citizen"]) {
    assert.notDeepEqual(projectScopeFilter(asUser(role)), {}, `${role} must be scoped`)
  }
})

// `citizen` is a real role, reachable through PUT /api/users/:id, but named by
// none of the three scoped branches. The fallback must deny, and deny the same
// way `canAccessProject` does — two halves of one rule must not disagree.
test("regression: an unnamed role is denied, not silently granted everything", () => {
  const citizen = asUser("citizen")
  const filter = projectScopeFilter(citizen)

  assert.notDeepEqual(filter, {}, "an empty filter matches every project")
  assert.equal(
    canAccessProject(citizen, { officer: oid(), supervisor: oid() }), false,
    "the predicate half of the rule must agree with the filter half"
  )
})

// Unreachable in practice, since both call sites run behind `protect`. Pinned
// anyway: a scope filter that answers "everything" when it does not know who is
// asking is the dangerous shape.
test("projectScopeFilter denies a missing user", () => {
  assert.notDeepEqual(projectScopeFilter(undefined), {})
  assert.notDeepEqual(projectScopeFilter(null), {})
})

test("canAccessProject: admin may act on any project", () => {
  const project = { officer: oid(), supervisor: oid() }
  assert.equal(canAccessProject(asUser("admin"), project), true)
})

test("canAccessProject: an officer may act only on their own project", () => {
  const mine = oid()
  const officer = asUser("officer", mine)
  assert.equal(canAccessProject(officer, { officer: mine }), true)
  assert.equal(canAccessProject(officer, { officer: oid() }), false)
})

test("canAccessProject: a supervisor may act only on projects they supervise", () => {
  const mine = oid()
  const supervisor = asUser("supervisor", mine)
  assert.equal(canAccessProject(supervisor, { supervisor: mine }), true)
  assert.equal(canAccessProject(supervisor, { supervisor: oid() }), false)
})

// An officer must not gain access by being the supervisor, or vice versa —
// each role is checked against its own field only.
test("canAccessProject does not cross officer and supervisor fields", () => {
  const id = oid()
  assert.equal(canAccessProject(asUser("officer", id), { supervisor: id }), false)
  assert.equal(canAccessProject(asUser("supervisor", id), { officer: id }), false)
})

test("canAccessProject compares by value, not identity", () => {
  const id = oid()
  // A lean read returns an ObjectId; JSON gives a string. Both must match.
  assert.equal(canAccessProject(asUser("officer", id), { officer: String(id) }), true)
  assert.equal(canAccessProject(asUser("officer", String(id)), { officer: id }), true)
})

test("canAccessProject denies a missing project and an unknown role", () => {
  assert.equal(canAccessProject(asUser("admin"), null), false)
  assert.equal(canAccessProject(asUser("citizen", oid()), { officer: oid() }), false)
  assert.equal(canAccessProject(undefined, { officer: oid() }), false)
})

// The comparison is String(a) === String(b), so two nulls stringify alike and
// match. Unreachable through the application, since `protect` guarantees a
// populated ObjectId — pinned so the risk surfaces if that ever changes.
test("supervisor access against an unsupervised project: real behaviour", () => {
  assert.equal(
    canAccessProject({ _id: undefined, role: "supervisor" }, { supervisor: null }), false,
    "an absent id must not match a null supervisor"
  )
  assert.equal(
    canAccessProject({ _id: null, role: "supervisor" }, { supervisor: null }), true,
    "known edge: null stringifies equal — unreachable while `protect` supplies the user"
  )
})
