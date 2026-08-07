// Regression — F-8. Notification links were role-namespaced path literals baked
// into the producers: every project link was written under /officer and the
// supervisor assignment pointed at /supervisor/dashboard. A notification is
// addressed to one recipient, so a path built for the wrong role is refused by
// the client router, which redirects to that role's own dashboard instead of the
// record the notification is about.
//
// The mapping is pure, so it is asserted here without a database. The role
// LOOKUP that feeds it is covered over HTTP in the integration suite.

const test = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const { NOTIFICATION_LINK_KINDS, ROLE_ROUTES, linkFor } = require("../../src/config/notificationLinks")

const ID = "6a71c0ffee00000000000001"

test("every role resolves the destinations it has a screen for", () => {
  assert.equal(linkFor("admin", { kind: "project", id: ID }), `/admin/projects/${ID}`)
  assert.equal(linkFor("officer", { kind: "project", id: ID }), `/officer/projects/${ID}`)
  // Not the dashboard: /supervisor/tasks/:id is where progress is recorded.
  assert.equal(linkFor("supervisor", { kind: "project", id: ID }), `/supervisor/tasks/${ID}`)
  assert.equal(linkFor("citizen", { kind: "project", id: ID }), `/projects/${ID}`)

  assert.equal(linkFor("admin", { kind: "complaint", id: ID }), `/admin/complaints/${ID}`)
  assert.equal(linkFor("officer", { kind: "complaint", id: ID }), `/officer/complaints/${ID}`)

  assert.equal(linkFor("admin", { kind: "conflict", id: ID }), `/admin/conflicts/${ID}`)
  assert.equal(linkFor("officer", { kind: "conflict", id: ID }), `/officer/conflicts/${ID}`)

  // The list kind carries no id.
  assert.equal(linkFor("admin", { kind: "conflicts" }), "/admin/conflicts")
  assert.equal(linkFor("officer", { kind: "conflicts" }), "/officer/conflicts")
})

test("a role with no screen for a destination gets no link, not a broken one", () => {
  // The supervisor shell is dashboard, tasks and settings; the citizen routes
  // are the public ones. Neither has a conflicts or complaints screen, so a
  // path under /officer or /admin would only bounce them to their dashboard.
  for (const role of ["supervisor", "citizen"]) {
    for (const kind of ["conflicts", "conflict", "complaint"]) {
      assert.equal(linkFor(role, { kind, id: ID }), undefined,
        `${role} was given a ${kind} link with no screen to open it`)
    }
  }
})

test("an unresolvable destination yields no link rather than a malformed path", () => {
  assert.equal(linkFor("officer", null), undefined)
  assert.equal(linkFor("officer", {}), undefined)
  assert.equal(linkFor("officer", { kind: "nonsense", id: ID }), undefined)
  // An unknown role — nothing outside the User enum should resolve.
  assert.equal(linkFor(undefined, { kind: "project", id: ID }), undefined)
  assert.equal(linkFor("stranger", { kind: "project", id: ID }), undefined)
  // A record kind with no id cannot produce a usable path.
  assert.equal(linkFor("officer", { kind: "project" }), undefined)
  assert.equal(linkFor("admin", { kind: "complaint" }), undefined)
})

// The map exists to mirror the client router. A path that no route matches is
// the exact defect F-8 records, so it is checked against the router itself
// rather than against a list restated here.
test("every mapped path matches a route the frontend actually registers", () => {
  const router = readFileSync(
    join(__dirname, "..", "..", "..", "frontend", "src", "router", "AppRouter.jsx"),
    "utf8"
  )
  const declared = [...router.matchAll(/path="([^"]+)"/g)].map(([, path]) => path)
  assert.ok(declared.length > 10, "no routes parsed from AppRouter.jsx — has the router moved?")

  const matchesARoute = (path) =>
    declared.some((route) => new RegExp(`^${route.replace(/:[^/]+/g, "[^/]+")}$`).test(path))

  const unmatched = []
  for (const [role, kinds] of Object.entries(ROLE_ROUTES)) {
    for (const [kind, build] of Object.entries(kinds)) {
      const path = build(ID)
      if (!matchesARoute(path)) unmatched.push(`${role}.${kind} -> ${path}`)
    }
  }

  assert.deepEqual(unmatched, [],
    "These notification links point at routes the frontend does not register:\n  " +
      unmatched.join("\n  "))
})

test("the kind vocabulary is the one the producers use", () => {
  assert.deepEqual(
    Object.values(NOTIFICATION_LINK_KINDS).sort(),
    ["complaint", "conflict", "conflicts", "project"]
  )
})
