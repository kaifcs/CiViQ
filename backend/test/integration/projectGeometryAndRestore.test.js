// Verified HTTP workflows for geometry persistence and soft-delete access:
//
// 1. Project.location.geoJSON survives create, update, and read through the API.
// 2. Only administrators can access soft-deleted projects with ?includeDeleted=true,
//    making the restore workflow reachable.

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { userDoc, departmentDoc, projectDoc } = require("../helpers/fixtures")

const PASSWORD = "civiq123"

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

// A corridor along a road: the shape the utility layer renders. Positions are
// [lng, lat], per RFC 7946 — the ordering the frontend helpers emit.
const LINE_GEOMETRY = {
  type: "LineString",
  coordinates: [[77.4538, 28.6692], [77.4560, 28.6700], [77.4585, 28.6712]],
}

const POLYGON_GEOMETRY = {
  type: "Polygon",
  coordinates: [[
    [77.4538, 28.6692], [77.4560, 28.6692],
    [77.4560, 28.6710], [77.4538, 28.6710],
    [77.4538, 28.6692],
  ]],
}

test("project geometry and soft-delete visibility", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  const app = require("../../src/app")
  const User = require("../../src/models/User")
  const Project = require("../../src/models/Project")
  const Department = require("../../src/models/Department")

  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}/api`

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await dropAndDisconnect()
  })

  await clearCollections()

  const department = await Department.create(departmentDoc())
  const mk = async (role, email) => {
    const user = new User(userDoc({ role, email, department: department._id }))
    await user.save()
    return user
  }
  const admin = await mk("admin", "geo-admin@s5.test")
  const officer = await mk("officer", "geo-officer@s5.test")

  const call = async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }
  }

  const login = async (email) => {
    const res = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } })
    assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`)
    return res.body.token
  }

  const tokens = { admin: await login("geo-admin@s5.test"), officer: await login("geo-officer@s5.test") }

  const createPayload = (geoJSON) => ({
    title: "Geometry test project",
    department: String(department._id),
    projectType: "road",
    description: "fixture",
    startDate: "2026-02-01",
    endDate: "2026-04-01",
    location: {
      ward: "Ward 3",
      centerCoords: { lat: 28.6692, lng: 77.4538 },
      ...(geoJSON ? { geoJSON } : {}),
    },
  })

  await t.test("a LineString survives create and is returned unchanged on read", async () => {
    const created = await call("/projects", {
      token: tokens.officer, method: "POST", body: createPayload(LINE_GEOMETRY),
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))

    const id = created.body.project._id
    const read = await call(`/projects/${id}`, { token: tokens.officer })
    assert.equal(read.status, 200)
    assert.deepEqual(read.body.location.geoJSON, LINE_GEOMETRY,
      "stored geometry must round-trip byte for byte — the server never derives or rewrites it")
  })

  await t.test("a Polygon can replace a LineString through an update", async () => {
    const created = await call("/projects", {
      token: tokens.officer, method: "POST", body: createPayload(LINE_GEOMETRY),
    })
    const id = created.body.project._id

    const updated = await call(`/projects/${id}`, {
      token: tokens.officer, method: "PUT",
      body: { location: { ward: "Ward 3", centerCoords: { lat: 28.6692, lng: 77.4538 }, geoJSON: POLYGON_GEOMETRY } },
    })
    assert.equal(updated.status, 200, JSON.stringify(updated.body))
    assert.deepEqual(updated.body.location.geoJSON, POLYGON_GEOMETRY)
  })

  await t.test("a project drawn with no shape stores no geometry rather than an empty one", async () => {
    const created = await call("/projects", {
      token: tokens.officer, method: "POST", body: createPayload(null),
    })
    assert.equal(created.status, 201)

    const stored = await Project.findById(created.body.project._id).lean()
    assert.equal(stored.location.geoJSON, undefined,
      "absent geometry must stay absent — the GIS layer treats a present-but-empty value as a shape")
  })

  await t.test("centerCoords is still required, so geometry cannot stand in for it", async () => {
    const payload = createPayload(LINE_GEOMETRY)
    delete payload.location.centerCoords

    const created = await call("/projects", { token: tokens.officer, method: "POST", body: payload })
    assert.equal(created.status, 400, "a project without a centre point must be refused")
    assert.equal(created.body.success, false)
  })

  await t.test("a soft-deleted project is hidden from the default list and from its own detail route", async () => {
    const project = await Project.create(projectDoc({
      officer: officer._id, department: department._id, createdBy: officer._id,
    }))

    const deleted = await call(`/projects/${project._id}/status`, {
      token: tokens.admin, method: "PATCH", body: { isActive: false },
    })
    assert.equal(deleted.status, 200)

    const list = await call("/projects", { token: tokens.admin })
    assert.equal(list.status, 200)
    assert.ok(!list.body.some((p) => String(p._id) === String(project._id)),
      "a deleted project must not appear in the default register")

    const detail = await call(`/projects/${project._id}`, { token: tokens.officer })
    assert.equal(detail.status, 404, "the owning officer must not reach a deleted project")
  })

  await t.test("an administrator can list deleted projects and restore one", async () => {
    const project = await Project.create(projectDoc({
      officer: officer._id, department: department._id, createdBy: officer._id,
    }))
    await call(`/projects/${project._id}/status`, {
      token: tokens.admin, method: "PATCH", body: { isActive: false },
    })

    const withDeleted = await call("/projects?includeDeleted=true", { token: tokens.admin })
    assert.equal(withDeleted.status, 200)
    const found = withDeleted.body.find((p) => String(p._id) === String(project._id))
    assert.ok(found, "?includeDeleted=true must surface the row, or restore is unreachable")
    assert.equal(found.isActive, false)

    const restored = await call(`/projects/${project._id}/status`, {
      token: tokens.admin, method: "PATCH", body: { isActive: true },
    })
    assert.equal(restored.status, 200)
    assert.equal(restored.body.isActive, true)

    const list = await call("/projects", { token: tokens.admin })
    assert.ok(list.body.some((p) => String(p._id) === String(project._id)),
      "a restored project must return to the default register")
  })

  await t.test("includeDeleted is ignored for a non-administrator", async () => {
    const project = await Project.create(projectDoc({
      officer: officer._id, department: department._id, createdBy: officer._id,
    }))
    await call(`/projects/${project._id}/status`, {
      token: tokens.admin, method: "PATCH", body: { isActive: false },
    })

    const asOfficer = await call("/projects?includeDeleted=true", { token: tokens.officer })
    assert.equal(asOfficer.status, 200, "the parameter is ignored, not refused")
    assert.ok(!asOfficer.body.some((p) => String(p._id) === String(project._id)),
      "an officer must not see a deleted project by asking for one")
  })

  await t.test("the ward register is readable without a session", async () => {
    const res = await call("/config/wards")
    assert.equal(res.status, 200, "the public complaint form selects from this register")
    assert.equal(res.body.success, true)
    assert.ok(Array.isArray(res.body.wards) && res.body.wards.length > 0)
    // It must stay a bare lookup: nothing user- or record-derived may appear.
    assert.deepEqual(Object.keys(res.body).sort(), ["count", "success", "wards"])
  })

  // Guards the admin id used above from being silently unused if the test is
  // reshaped later; the login above already proves the account works.
  assert.equal(admin.role, "admin")
})
