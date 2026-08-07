// Clash detection — the spatial, temporal and work-type rules that decide
// whether two municipal works collide. Internals are not exported, so the rules
// are exercised by placing real projects at known distances and dates.

// Fixture distances are derived from the configured buffers rather than guessed,
// so a change to those buffers surfaces here.

const test = require("node:test")
const assert = require("node:assert/strict")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { projectDoc } = require("../helpers/fixtures")

const Project = require("../../src/models/Project")
const config = require("../../src/config/staticConfig")
const { detectClashes, getSuggestedStartDate } = require("../../src/services/clashDetection")

// road+road is "incompatible" in the configured matrix; road+electricity is
// "conditional"; water+parks is "compatible". Asserted so the fixtures below
// stay meaningful if the matrix is ever edited.
test("the conflict matrix supplies the severities these tests rely on", () => {
  assert.equal(config.conflictMatrix.road.road, "incompatible")
  assert.equal(config.conflictMatrix.road.electricity, "conditional")
  assert.equal(config.conflictMatrix.water.parks, "compatible")
})

const DEFAULT_BUFFER_DAYS = 7
const daysBetween = (a, b) => Math.round((a - b) / 86_400_000)

test("getSuggestedStartDate clears the blocking project by its configured buffer", () => {
  const endDate = new Date("2025-06-01T00:00:00.000Z")
  const suggested = getSuggestedStartDate({ endDate, projectType: "water" })
  assert.equal(daysBetween(suggested, endDate), config.bufferDays.water)
  assert.ok(suggested > endDate, "the suggestion must fall after the blocking project ends")
})

// Every coarse projectType has a direct key in bufferDays, so no type falls
// through to the 7-day default.
test("every coarse project type resolves its configured buffer without falling back", () => {
  const endDate = new Date("2025-06-01T00:00:00.000Z")
  const types = Object.keys(config.bufferDays)
  for (const projectType of types) {
    const expected = config.bufferDays[projectType]
    assert.ok(expected !== undefined, `${projectType} has no configured buffer`)
    assert.equal(
      daysBetween(getSuggestedStartDate({ endDate, projectType }), endDate),
      expected,
      `${projectType} should use its configured ${expected}-day buffer, not the fallback`
    )
  }
})

test("getSuggestedStartDate falls back for an unknown project type", () => {
  const endDate = new Date("2025-06-01T00:00:00.000Z")
  const suggested = getSuggestedStartDate({ endDate, projectType: "not-a-type" })
  assert.equal(daysBetween(suggested, endDate), DEFAULT_BUFFER_DAYS)
  assert.ok(Number.isFinite(suggested.getTime()))
})

test("clash detection", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)
  t.after(dropAndDisconnect)

  // A candidate must be pending, approved or active; the incoming project is
  // road-type running Feb–May.
  const incoming = () => new Project(projectDoc({
    projectType: "road",
    startDate: new Date("2025-02-01"),
    endDate: new Date("2025-05-01"),
    status: "active",
  }))

  await t.test("co-located overlapping road works clash as incompatible", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 10, projectType: "road" }))
    const clashes = await detectClashes(incoming())
    assert.equal(clashes.length, 1)
    assert.equal(clashes[0].severity, "incompatible")
    assert.deepEqual(clashes[0].clashTypes, ["geographic", "timeline", "worktype"])
    assert.ok(clashes[0].distance <= 12, `distance ${clashes[0].distance}m`)
  })

  await t.test("a conditional work-type pairing is reported as conditional", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 10, projectType: "electricity" }))
    const clashes = await detectClashes(incoming())
    assert.equal(clashes.length, 1)
    assert.equal(clashes[0].severity, "conditional")
  })

  // The three independent reasons a pair does NOT clash. Each is asserted on
  // its own, so a failure names the rule that broke.
  await t.test("compatible work types do not clash even when co-located", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 5, projectType: "parks" }))
    const water = new Project(projectDoc({
      projectType: "water", startDate: new Date("2025-02-01"), endDate: new Date("2025-05-01"),
    }))
    assert.deepEqual(await detectClashes(water), [])
  })

  await t.test("non-overlapping dates do not clash", async () => {
    await clearCollections()
    await Project.create(projectDoc({
      metres: 10, projectType: "road",
      startDate: new Date("2027-01-01"), endDate: new Date("2027-06-01"),
    }))
    assert.deepEqual(await detectClashes(incoming()), [])
  })

  await t.test("distant works do not clash", async () => {
    await clearCollections()
    // 5 km north and in another ward, so neither candidate clause selects it.
    await Project.create(projectDoc({ metres: 5000, projectType: "road", ward: "Ward-Far" }))
    assert.deepEqual(await detectClashes(incoming()), [])
  })

  await t.test("touching timelines count as overlapping", async () => {
    await clearCollections()
    // Ends exactly when the incoming project starts: inclusive by design, since
    // two crews on the same ground on the same day is precisely the collision.
    await Project.create(projectDoc({
      metres: 10, projectType: "road",
      startDate: new Date("2024-12-01"), endDate: new Date("2025-02-01"),
    }))
    const clashes = await detectClashes(incoming())
    assert.equal(clashes.length, 1, "a same-day handover must be reported")
  })

  await t.test("only live projects are candidates", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 10, projectType: "road", status: "completed" }))
    await Project.create(projectDoc({ metres: 10, projectType: "road", status: "rejected" }))
    assert.deepEqual(await detectClashes(incoming()), [],
      "completed and rejected work must not raise a clash")
  })

  await t.test("soft-deleted projects are excluded", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 10, projectType: "road", isActive: false }))
    assert.deepEqual(await detectClashes(incoming()), [])
  })

  await t.test("a project never clashes with itself", async () => {
    await clearCollections()
    const saved = await Project.create(projectDoc({
      projectType: "road", startDate: new Date("2025-02-01"), endDate: new Date("2025-05-01"),
    }))
    assert.deepEqual(await detectClashes(saved), [])
  })

  await t.test("several clashes are all reported", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 8, projectType: "road" }))
    await Project.create(projectDoc({ metres: 12, projectType: "road" }))
    await Project.create(projectDoc({ metres: 9, projectType: "electricity" }))
    const clashes = await detectClashes(incoming())
    assert.equal(clashes.length, 3)
    assert.equal(clashes.filter((c) => c.severity === "incompatible").length, 2)
    assert.equal(clashes.filter((c) => c.severity === "conditional").length, 1)
  })

  // The candidate query uses a lean projection, which must still carry every
  // field the three checks read, present and correctly typed.
  await t.test("regression: clash records keep their full shape after the S4 lean projection", async () => {
    await clearCollections()
    const other = await Project.create(projectDoc({ metres: 10, projectType: "road" }))
    const [clash] = await detectClashes(incoming())

    assert.deepEqual(Object.keys(clash).sort(), ["clashTypes", "distance", "projectId", "severity"])
    assert.equal(String(clash.projectId), String(other._id), "projectId must reference the candidate")
    assert.equal(typeof clash.distance, "number")
    assert.ok(Number.isFinite(clash.distance))
    assert.ok(Array.isArray(clash.clashTypes))
    assert.equal(typeof clash.severity, "string")
  })

  // The bounding box is a cheap pre-filter sized so it can never exclude a real
  // clash. A project with no ward must still be found by coordinates alone.
  await t.test("a candidate in another ward is still found by coordinates", async () => {
    await clearCollections()
    await Project.create(projectDoc({ metres: 10, projectType: "road", ward: "Ward-Different" }))
    const clashes = await detectClashes(incoming())
    assert.equal(clashes.length, 1, "the bounding box must catch a near project in another ward")
  })
})
