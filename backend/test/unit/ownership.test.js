// S2 — resource-level authorization (ownership).
//
// S2 closed three exploitable escalation paths. The rule it introduced lives in
// exactly one place so the list and the single-resource routes cannot drift
// apart again; these tests pin the rule itself, in both of the forms callers
// use it: as a Mongo filter fragment, and as a decision on a loaded document.

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

// P1-1 regression. `citizen` is a real value of the User.role enum and is
// reachable through PUT /api/users/:id, but it is named by none of the three
// scoped branches. It previously fell through to `{}` and received an
// admin-wide scope, so a citizen account could list and read every project.
// The fallback must deny, and it must deny the same way `canAccessProject`
// already did — the two halves of one rule disagreeing is what the defect was.
test("regression: an unnamed role is denied, not silently granted everything", () => {
  const citizen = asUser("citizen")
  const filter = projectScopeFilter(citizen)

  assert.notDeepEqual(filter, {}, "an empty filter matches every project")
  assert.equal(
    canAccessProject(citizen, { officer: oid(), supervisor: oid() }), false,
    "the predicate half of the rule must agree with the filter half"
  )
})

// The fallback denies rather than tolerating. Neither call site can reach this
// — both run behind `protect`, which guarantees a loaded user — but a scope
// filter that answers "everything" when it does not know who is asking is the
// exact shape of the defect above, so the safe answer is pinned here too.
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

// Documents actual behaviour, including one latent edge.
//
// The comparison is String(a) === String(b), so a user whose _id is null and a
// project whose supervisor is null both stringify to "null" and match. That is
// NOT reachable through the application: `protect` loads a real user document
// before any handler runs, so req.user._id is always a populated ObjectId, and
// an undefined id (the shape a malformed caller would actually have) correctly
// does not match. The case is pinned here so that if the id ever becomes
// caller-influenced, this test fails and the risk surfaces rather than hiding.
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
