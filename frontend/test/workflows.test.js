// Tests the pure modules behind the workflows added in this pass.
// JSX screens are not tested directly because the Node test runner has no JSX transform.

import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deptStyle, PROJECT_STATUS_OPTIONS, COMPLAINT_STATUS_CONFIG } from "../src/components/uiStyles.js"
import { MCDM_CRITERIA, criterionWidth } from "../src/components/dashboard/constants.js"
import { buildGeometry, GEOMETRY_MODES } from "../src/gis/geometryModes.js"
import { isGeometry } from "../src/gis/geojson.js"
import {
  adaptComplaint, ROLES, ISSUE_TYPE_OPTIONS, UNAVAILABLE_FIELDS, buildProjectPayload,
} from "../src/services/adapters.js"
import { dashboardPathFor } from "../src/router/dashboardPaths.js"

// Reads backend schemas directly so frontend vocabulary stays in sync with API enums.
const backendSource = (path) =>
  readFileSync(fileURLToPath(new URL(`../../backend/src/${path}`, import.meta.url)), "utf8")

// Screens are read as text for the same reason: no JSX transform is available.
const frontendSource = (path) =>
  readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8")

// Every screen rendered inside DashboardLayout — the role sections plus the
// shared notification centre. Enumerated from disk so a page added later is
// covered without anyone remembering to list it.
const AUTHENTICATED_PAGE_DIRS = ["admin", "officer", "supervisor", "notifications"]

const authenticatedPages = () =>
  AUTHENTICATED_PAGE_DIRS.flatMap((dir) => {
    const root = fileURLToPath(new URL(`../src/pages/${dir}`, import.meta.url))
    return readdirSync(root)
      .filter((name) => name.endsWith(".jsx"))
      .map((name) => join(root, name))
  })

// --- Department badge styles ------------------------------------------------
test("every department code gets a style, including codes no dictionary listed", () => {
  const codes = ["PWD", "WS", "ELEC", "TE", "UP", "SAN", "HLTH", "PARK", "SCC", "DS", "NEWDEPT"]
  for (const code of codes) {
    const style = deptStyle(code)
    assert.ok(style && style.includes("bg-["), `${code} resolved to no background`)
    assert.ok(style.includes("dark:"), `${code} has no dark-mode variant`)
  }
})

test("a department badge style is stable across calls", () => {
  assert.equal(deptStyle("PWD"), deptStyle("PWD"))
  assert.equal(deptStyle("DS"), deptStyle("DS"))
})

test("an unresolved department falls back rather than throwing", () => {
  for (const value of [null, undefined, ""]) {
    assert.ok(deptStyle(value).includes("bg-["), `${value} produced no style`)
  }
})

// --- Project status filters -------------------------------------------------
test("the status filter offers every status the backend defines", () => {
  const enumLine = backendSource("models/Project.js").match(
    /status:\s*{[\s\S]*?enum:\s*\[([^\]]+)]/
  )
  assert.ok(enumLine, "could not read Project.status from the schema")
  const backendStatuses = [...enumLine[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  const offered = PROJECT_STATUS_OPTIONS.map((o) => o.value)
  assert.deepEqual(
    [...offered].sort(),
    [...backendStatuses].sort(),
    "a status that exists in the backend must be filterable, and no invented status may be offered"
  )
  for (const option of PROJECT_STATUS_OPTIONS) assert.ok(option.label, `${option.value} has no label`)
})

// --- MCDM unmeasured criteria ----------------------------------------------
test("the criteria marked unmeasured are exactly the ones the engine leaves neutral", () => {
  const source = backendSource("services/mcdmEngine.js")
  const declared = source.match(/UNMEASURED_CRITERIA\s*=\s*\[([^\]]+)]/)
  assert.ok(declared, "mcdmEngine no longer declares UNMEASURED_CRITERIA")
  const backendUnmeasured = [...declared[1].matchAll(/"(\w+)"/g)].map((m) => m[1])
  const uiUnmeasured = MCDM_CRITERIA.filter((c) => c.measured === false).map((c) => c.key)
  assert.deepEqual([...uiUnmeasured].sort(), [...backendUnmeasured].sort())
})

test("an unmeasured criterion never draws a bar, however the constant is stored", () => {
  const breakdown = { populationImpact: 5, economicValue: 5, conditionSeverity: 8 }
  assert.equal(criterionWidth(breakdown, "populationImpact"), "0%")
  assert.equal(criterionWidth(breakdown, "economicValue"), "0%")
  assert.equal(criterionWidth(breakdown, "conditionSeverity"), "80%")
})

test("MCDM weights still total 100 percent after the labelling change", () => {
  assert.equal(MCDM_CRITERIA.reduce((sum, c) => sum + c.weight, 0), 100)
})

// --- Geometry authoring -----------------------------------------------------
const LINE = [{ lat: 28.66, lng: 77.45 }, { lat: 28.67, lng: 77.46 }]
const RING = [{ lat: 28.66, lng: 77.45 }, { lat: 28.67, lng: 77.45 }, { lat: 28.67, lng: 77.46 }]

test("a line of two or more points builds a valid LineString in [lng, lat] order", () => {
  const geometry = buildGeometry("LineString", LINE)
  assert.ok(isGeometry(geometry))
  assert.equal(geometry.type, "LineString")
  assert.deepEqual(geometry.coordinates[0], [77.45, 28.66], "positions must be [lng, lat]")
})

test("three or more points build a Polygon whose ring is closed", () => {
  const geometry = buildGeometry("Polygon", RING)
  assert.ok(isGeometry(geometry))
  assert.equal(geometry.type, "Polygon")
  const ring = geometry.coordinates[0]
  assert.deepEqual(ring[0], ring[ring.length - 1], "a linear ring must repeat its first position last")
})

test("an incomplete or invalid shape yields null rather than malformed geometry", () => {
  assert.equal(buildGeometry("LineString", []), null)
  assert.equal(buildGeometry("LineString", [LINE[0]]), null, "one point is not a line")
  assert.equal(buildGeometry("Polygon", LINE), null, "two points cannot close a ring")
  assert.equal(buildGeometry("LineString", [{ lat: 999, lng: 999 }, { lat: 91, lng: 0 }]), null)
})

test("the declared minimum vertex counts match what the constructors accept", () => {
  for (const [mode, { minVertices }] of Object.entries(GEOMETRY_MODES)) {
    const points = Array.from(
      { length: minVertices },
      (_, i) => ({ lat: 28.6 + i / 100, lng: 77.4 + i / 100 })
    )
    assert.ok(buildGeometry(mode, points), `${mode} rejected its own stated minimum`)
    assert.equal(buildGeometry(mode, points.slice(0, -1)), null, `${mode} accepted one point too few`)
  }
})

// --- Geometry reaches the API payload --------------------------------------
const baseForm = {
  title: "T",
  departmentId: "d1",
  type: "Road",
  description: "d",
  startDate: "2026-01-01",
  endDate: "2026-02-01",
  ward: "Ward 3",
  lat: "28.66",
  lng: "77.45",
}

test("a drawn shape is carried into location.geoJSON", () => {
  const geometry = buildGeometry("LineString", LINE)
  const payload = buildProjectPayload({ ...baseForm, geoJSON: geometry })
  assert.deepEqual(payload.location.geoJSON, geometry)
})

test("no drawn shape leaves geoJSON off the payload entirely", () => {
  const payload = buildProjectPayload({ ...baseForm, geoJSON: null })
  assert.ok(
    !("geoJSON" in payload.location),
    "an absent shape must be omitted, not sent as null — the GIS layer reads presence"
  )
})

// --- Complaint intake vocabulary -------------------------------------------
test("the complaint form offers exactly the backend issue types", () => {
  const enumLine = backendSource("models/Complaint.js").match(
    /issueType:\s*{[^}]*enum:\s*\[([^\]]+)]/
  )
  assert.ok(enumLine, "could not read Complaint.issueType from the schema")
  const backendTypes = [...enumLine[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  assert.deepEqual(
    ISSUE_TYPE_OPTIONS.map((o) => o.value).sort(),
    [...backendTypes].sort()
  )
  for (const option of ISSUE_TYPE_OPTIONS) assert.ok(option.label)
})

test("the tracking timeline covers every complaint status, in workflow order", () => {
  const enumLine = backendSource("models/Complaint.js").match(
    /status:\s*{[\s\S]*?enum:\s*\[([^\]]+)]/
  )
  const backendStatuses = [...enumLine[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  assert.deepEqual(Object.keys(COMPLAINT_STATUS_CONFIG), backendStatuses)
})

// --- Roles ------------------------------------------------------------------
test("role selection offers exactly the backend role enum and invents nothing", () => {
  const enumLine = backendSource("models/User.js").match(
    /role:\s*{[\s\S]*?enum:\s*\[([^\]]+)]/
  )
  assert.ok(enumLine, "could not read User.role from the schema")
  const backendRoles = [...enumLine[1].matchAll(/"(\w+)"/g)].map((m) => m[1])
  assert.deepEqual([...ROLES].sort(), [...backendRoles].sort())
  assert.ok(!ROLES.includes("citizen"), "there is no citizen account type — citizen surfaces are unauthenticated")
})

// --- Complaint overdue removal ---------------------------------------------
test("a complaint carries no overdue flag, because nothing in the schema dates one", () => {
  const complaint = adaptComplaint({ _id: "c1", status: "submitted" }, new Map())
  assert.ok(
    !("overdue" in complaint),
    "a constant false made the overdue treatment unreachable; the field was removed rather than faked"
  )
  assert.ok(!UNAVAILABLE_FIELDS.complaint.includes("overdue"))
})

test("resolvedAt is never derived from updatedAt, whatever the status", () => {
  const updatedAt = "2026-03-01T00:00:00.000Z"

  for (const status of ["submitted", "acknowledged", "in_progress", "resolved"]) {
    const complaint = adaptComplaint({ _id: "c", status, updatedAt }, new Map())
    assert.equal(
      complaint.resolvedAt,
      null,
      `resolvedAt was derived for a ${status} complaint; the schema stores no such timestamp`
    )
    // The real field stays available under its own name.
    assert.equal(complaint.updatedAt, updatedAt)
    assert.notEqual(
      complaint.resolvedAt,
      complaint.updatedAt,
      "resolvedAt must never equal updatedAt, or the UI can present one as the other"
    )
  }

  // Declared alongside the other fields with no backend source, so the absence
  // is documented rather than looking like an oversight.
  assert.ok(UNAVAILABLE_FIELDS.complaint.includes("resolvedAt"))
  assert.ok(UNAVAILABLE_FIELDS.complaint.includes("acknowledgedAt"))
})

function timelineStep(screen, key) {
  const source = frontendSource(screen)
  const table = source.match(/const TIMELINE_STEPS = \[([\s\S]*?)\n\]/)
  assert.ok(table, `${screen} has no TIMELINE_STEPS table`)

  const row = table[1]
    .split("\n")
    .find((line) => new RegExp(`key:\\s*['"]${key}['"]`).test(line))
  assert.ok(row, `${screen} has no '${key}' row in TIMELINE_STEPS`)
  return { source, row }
}

const COMPLAINT_DETAIL_SCREENS = [
  "pages/admin/AdminComplaintDetail.jsx",
  "pages/officer/OfficerComplaintDetail.jsx",
]

// The resolved step is the one that used to render `updatedAt` under a "Resolved"
// heading. Both complaint screens must mark it as reached without dating it.
test("no complaint screen dates the resolved timeline step", () => {
  for (const screen of COMPLAINT_DETAIL_SCREENS) {
    const { source, row } = timelineStep(screen, "resolved")

    assert.ok(
      !/dateKey:\s*['"]resolvedAt['"]/.test(row),
      `${screen} dates the resolved step from resolvedAt, which the schema does not store`
    )
    // Stronger than banning one name: the step may carry no date field at all,
    // so substituting any other stored timestamp fails too.
    assert.ok(
      !/dateKey:\s*['"]/.test(row),
      `${screen} gives the resolved step a dateKey; no stored field records when a complaint was resolved`
    )
    assert.match(
      row,
      /dateKey:\s*null/,
      `${screen} must use dateKey: null for the resolved step, the same representation as in_progress`
    )

    // The renderer has to honour null, or the table above would be decorative.
    assert.match(
      source,
      /step\.dateKey \? complaint\[step\.dateKey\] : null/,
      `${screen} must skip the date when a step declares dateKey: null`
    )

    // Steps that do have an authoritative source keep it.
    assert.match(
      timelineStep(screen, "submitted").row,
      /dateKey:\s*['"]filedAt['"]/,
      `${screen} lost the submitted timestamp, which is a real stored value (createdAt)`
    )
  }
})

// The information card names the value it actually shows.
test("the complaint information card reports updatedAt under its own name", () => {
  const detail = frontendSource("pages/admin/AdminComplaintDetail.jsx")
  assert.ok(
    !/label="Resolved on"/.test(detail),
    'the "Resolved on" label overstates a timestamp the schema does not store'
  )
  assert.match(detail, /label="Last updated"/, "the row must name the value it actually shows")
})

test("no authenticated screen reads a complaint resolvedAt", () => {
  for (const file of authenticatedPages()) {
    const source = readFileSync(file, "utf8")
    for (const [hit] of source.matchAll(/[\w$]*[.?]*resolvedAt/g)) {
      assert.match(
        hit,
        /resolution\?\.resolvedAt$/,
        `${basename(file)} reads ${hit}; only Conflict stores a resolution timestamp`
      )
    }
  }
})

// One meaningful h1 per authenticated screen, and it describes that screen.
//
// The shell's visible navbar title is the h1 by default, which covers list
// screens and the loading, error and not-found states of every screen. A detail
// screen claims the h1 through useOwnsPageHeading once its entity has loaded, and
// the navbar steps down to a paragraph — so a project page reads "Bridge Repair",
// not "Projects", and the same string is never announced twice.
test("the shell owns the page h1 unless a screen claims it", () => {
  const shell = frontendSource("components/DashboardLayout.jsx")
  const navbar = frontendSource("components/Navbar.jsx")

  // The shell contributes no heading of its own — no sr-only duplicate of the
  // title the navbar already displays.
  assert.equal(
    (shell.match(/<h1[\s>]/g) || []).length,
    0,
    "the shell must not emit its own h1; the navbar title is the heading"
  )
  assert.ok(
    !/sr-only/.test(shell),
    "a visually hidden shell heading duplicates the visible navbar title in the accessibility tree"
  )
  assert.match(
    shell,
    /titleAsHeading=\{!pageOwnsHeading\}/,
    "the shell must tell the navbar whether it still owns the heading"
  )
  assert.match(
    shell,
    /<PageHeadingContext\.Provider value=\{setPageOwnsHeading\}>/,
    "screens need the claim setter to be able to take the heading"
  )

  // The navbar title is a real heading when the shell owns it, and chrome when
  // it does not.
  assert.match(
    navbar,
    /const Title = titleAsHeading \? "h1" : "p"/,
    "the visible page title must carry heading semantics when it is the page heading"
  )
  assert.match(navbar, /<Title className=/, "the navbar must render through the computed tag")

  // Claiming and rendering an h1 have to agree, in both directions: a screen that
  // renders a heading must have claimed it (or there would be two h1s), and a
  // screen that claims must render one (or there would be none).
  for (const file of authenticatedPages()) {
    const source = readFileSync(file, "utf8")
    const headings = (source.match(/<h1[\s>]/g) || []).length
    const claims = /useOwnsPageHeading\(/.test(source)

    if (claims) {
      assert.ok(
        headings > 0,
        `${basename(file)} claims the page heading but renders no h1, leaving the screen with none`
      )
      // Gated on the entity, so loading and not-found states fall back to the
      // navbar heading instead of having none.
      assert.match(
        source,
        /useOwnsPageHeading\(Boolean\(/,
        `${basename(file)} must claim on the presence of its entity, so transient states keep a heading`
      )
    } else {
      assert.equal(
        headings,
        0,
        `${basename(file)} renders an h1 without claiming it, so it competes with the navbar heading`
      )
    }
  }
})

// The className of the nearest enclosing div, so an assertion can be tied to the
// element that actually wraps a given child rather than to the file as a whole.
function wrapperClassNameOf(source, child) {
  const at = source.indexOf(child)
  assert.ok(at > -1, `${child} not found`)
  const opens = [...source.slice(0, at).matchAll(/<div className="([^"]*)"/g)]
  assert.ok(opens.length > 0, `no enclosing div found for ${child}`)
  return opens[opens.length - 1][1]
}

// Leaflet's panes reach 700 and its control corners 1000. The map renders inside
// the shell's content region, so the navbar's dropdowns (z-50) and their
// click-away backdrops (z-40) only clear it because the navbar sits in a raised
// stacking context. This pins that structure, not merely the presence of a large
// number somewhere in the file.
test("the navbar wrapper is the shell's only stacking context above Leaflet", () => {
  const LEAFLET_CEILING = 1000
  const shell = frontendSource("components/DashboardLayout.jsx")

  const navbarWrapper = wrapperClassNameOf(shell, "<Navbar")

  // Positioned, or the z-index is inert and would not contain the dropdowns.
  assert.match(
    navbarWrapper,
    /\brelative\b/,
    `the navbar wrapper must be positioned, otherwise z-index does not apply: "${navbarWrapper}"`
  )

  const raised = Number((navbarWrapper.match(/z-\[(\d+)\]/) || [])[1])
  assert.ok(
    Number.isFinite(raised),
    `the navbar wrapper declares no z-index, so Leaflet would paint over it: "${navbarWrapper}"`
  )
  assert.ok(
    raised > LEAFLET_CEILING,
    `the navbar wrapper must sit above Leaflet's ${LEAFLET_CEILING}; found ${raised}`
  )

  // The content region hosts the map, so it must not carry the same guard —
  // raising it would put the map back over the navbar.
  const contentWrapper = wrapperClassNameOf(shell, "<PageHeadingContext.Provider")
  assert.ok(
    !/z-\[/.test(contentWrapper),
    `the map/content region must not carry the navbar's stacking guard: "${contentWrapper}"`
  )

  // Exactly one element in the shell may outrank Leaflet, so the guard cannot be
  // duplicated onto another region.
  const aboveCeiling = [...shell.matchAll(/z-\[(\d+)\]/g)]
    .map((m) => Number(m[1]))
    .filter((z) => z > LEAFLET_CEILING)
  assert.deepEqual(
    aboveCeiling,
    [raised],
    "only the navbar wrapper may sit above Leaflet in the shell"
  )

  // The public portal solved this first; the two must not drift apart.
  const citizenCeiling = [...frontendSource("pages/citizen/CitizenNav.jsx").matchAll(/z-\[(\d+)\]/g)]
    .map((m) => Number(m[1]))
  assert.ok(
    citizenCeiling.some((z) => z > LEAFLET_CEILING),
    "CitizenNav is the reference implementation and must stay above Leaflet too"
  )
})

// --- one role-to-dashboard mapping, and /login cannot loop -----------------

// The mapping is a pure module now, so this is a behavioural test rather than a
// search for the right source text.
test("every role resolves to its own dashboard, and an unknown role to none", () => {
  assert.equal(dashboardPathFor("admin"), "/admin/dashboard")
  assert.equal(dashboardPathFor("officer"), "/officer/dashboard")
  assert.equal(dashboardPathFor("supervisor"), "/supervisor/dashboard")

  // Every account type the backend can issue has a home.
  for (const role of ROLES) {
    assert.ok(dashboardPathFor(role), `${role} has no dashboard path`)
  }

  // Anything else resolves to null rather than to "/login", which as a fallback
  // made the sign-in guard redirect to the page it was already on.
  for (const unknown of ["citizen", "", null, undefined, "ADMIN"]) {
    assert.equal(
      dashboardPathFor(unknown),
      null,
      `an unrecognised role (${String(unknown)}) must not resolve to a path`
    )
  }
})

test("the sign-in route redirects a live session without ever looping", () => {
  const router = frontendSource("router/AppRouter.jsx")
  const login = frontendSource("pages/auth/Login.jsx")

  assert.match(
    router,
    /<Route path="\/login" element=\{<LoginRoute \/>\} \/>/,
    "/login must go through the guard, not straight to the form"
  )

  const loginGuard = router.slice(router.indexOf("function LoginRoute"))
  assert.match(
    loginGuard,
    /if \(loading\) return null/,
    "deciding before the session restore finishes would bounce a signed-in user on every refresh"
  )
  // Guarded on a resolved path, so a role with no dashboard renders the form
  // instead of navigating to /login from /login.
  assert.match(
    loginGuard,
    /if \(home\) return <Navigate to=\{home\} replace \/>/,
    "the sign-in guard must redirect only when a dashboard exists, or an unknown role loops"
  )
  assert.match(loginGuard, /return <Login \/>/, "an unauthenticated visitor must still reach the form")

  const roleGuard = router.slice(router.indexOf("function RoleRoute"), router.indexOf("function LoginRoute"))
  assert.match(
    roleGuard,
    /getDashboardPath\(\) \|\| '\/login'/,
    "a session whose role has no dashboard must still have somewhere to be sent"
  )

  // Both callers read the shared table; neither repeats it.
  assert.match(login, /dashboardPathFor\(/, "Login must read the shared mapping")
  for (const role of ROLES) {
    assert.ok(
      !new RegExp(`'/${role}/dashboard'`).test(login),
      `Login repeats the ${role} path instead of reading the shared mapping`
    )
    assert.ok(
      !new RegExp(`'/${role}/dashboard'`).test(frontendSource("context/AuthContext.jsx")),
      `AuthContext repeats the ${role} path instead of reading the shared mapping`
    )
  }
})