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

test("resolvedAt is derived only for a resolved complaint", () => {
  const updatedAt = "2026-03-01T00:00:00.000Z"
  assert.equal(
    adaptComplaint({ _id: "c", status: "resolved", updatedAt }, new Map()).resolvedAt,
    updatedAt
  )
  assert.equal(
    adaptComplaint({ _id: "c", status: "in_progress", updatedAt }, new Map()).resolvedAt,
    null
  )
})

test("resolvedAt is a proxy for updatedAt, and updatedAt is available unaliased", () => {
  const complaint = adaptComplaint(
    { _id: "c", status: "resolved", updatedAt: "2026-03-01T00:00:00.000Z" },
    new Map()
  )
  assert.equal(complaint.updatedAt, "2026-03-01T00:00:00.000Z")
  assert.equal(complaint.resolvedAt, complaint.updatedAt, "resolvedAt must be nothing more than updatedAt")

  // Editing a resolved complaint moves both, which is exactly why the screens
  // must not label this as an authoritative resolution time.
  const edited = adaptComplaint(
    { _id: "c", status: "resolved", updatedAt: "2026-04-09T00:00:00.000Z" },
    new Map()
  )
  assert.notEqual(edited.resolvedAt, complaint.resolvedAt)

  // The complaint detail screen must not present it as one.
  const detail = frontendSource("pages/admin/AdminComplaintDetail.jsx")
  assert.ok(
    !/label="Resolved on"/.test(detail),
    'the "Resolved on" label overstates a timestamp the schema does not store'
  )
  assert.ok(/label="Last updated"/.test(detail), "the row must name the value it actually shows")

  // And it is still not invented anywhere: acknowledgement has no source at all.
  assert.equal(complaint.acknowledgedAt, null)
  assert.ok(UNAVAILABLE_FIELDS.complaint.includes("acknowledgedAt"))
})

test("every authenticated screen has exactly one h1, supplied by the shell", () => {
  const shell = frontendSource("components/DashboardLayout.jsx")
  assert.equal(
    (shell.match(/<h1[\s>]/g) || []).length,
    1,
    "the shell must contribute exactly one h1"
  )
  assert.ok(
    /<h1 className="sr-only">\{pageTitle\}<\/h1>/.test(shell),
    "the shell's h1 must carry the page title"
  )

  const navbar = frontendSource("components/Navbar.jsx")
  assert.ok(
    !/<h1[\s>]/.test(navbar),
    "the Navbar title repeats across a whole section, so it is chrome and not the page heading"
  )

  // No authenticated page may add a second one.
  for (const file of authenticatedPages()) {
    const source = readFileSync(file, "utf8")
    assert.equal(
      (source.match(/<h1[\s>]/g) || []).length,
      0,
      `${basename(file)} adds a second h1 on top of the shell's`
    )
  }
})

test("the authenticated shell stacks its navbar above Leaflet", () => {
  const LEAFLET_CEILING = 1000
  const shell = frontendSource("components/DashboardLayout.jsx")

  const declared = [...shell.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]))
  assert.ok(declared.length > 0, "the shell declares no z-index at all, so Leaflet would paint over it")
  assert.ok(
    declared.some((z) => z > LEAFLET_CEILING),
    `the navbar wrapper must sit above Leaflet's ${LEAFLET_CEILING}; found ${declared.join(", ")}`
  )

  // It has to be a stacking context, or the z-index would not contain the
  // absolutely-positioned dropdowns and the fixed backdrops inside it.
  assert.ok(
    /className="relative z-\[\d+\][^"]*"/.test(shell),
    "the raised wrapper must be positioned, otherwise z-index does not apply"
  )

  // The public portal solved this first; the two must not drift apart.
  const citizenCeiling = [...frontendSource("pages/citizen/CitizenNav.jsx").matchAll(/z-\[(\d+)\]/g)]
    .map((m) => Number(m[1]))
  assert.ok(
    citizenCeiling.some((z) => z > LEAFLET_CEILING),
    "CitizenNav is the reference implementation and must stay above Leaflet too"
  )
})

// --- /login is not reachable with a live session ---------------------------
test("the sign-in route redirects an authenticated visitor to their own dashboard", () => {
  const router = frontendSource("router/AppRouter.jsx")

  assert.ok(/<Route path="\/login" element={<LoginRoute \/>} \/>/.test(router),
    "/login must go through the guard, not straight to the form")

  const guard = router.slice(router.indexOf("function LoginRoute"))
  assert.ok(/if \(loading\) return null/.test(guard),
    "deciding before the session restore finishes would bounce a signed-in user on every refresh")
  assert.ok(/if \(user\) return <Navigate to={getDashboardPath\(\)} replace \/>/.test(guard),
    "the redirect must reuse getDashboardPath rather than repeating the role-to-route mapping")
  assert.ok(/return <Login \/>/.test(guard),
    "an unauthenticated visitor must still reach the form")
})