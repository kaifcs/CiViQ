// One Conflict row per project pair, guaranteed by the database.
//
// The pair is unordered, so (A,B) and (B,A) describe the same collision. The
// old { project1, project2 } index could not express that — the two orderings
// are separate index entries — so uniqueness is carried by a canonical
// `pairKey` instead. These tests cover the three ways a duplicate could appear:
// the same pair twice, the same pair reversed, and two writers at once.

const test = require("node:test")
const assert = require("node:assert/strict")
const mongoose = require("mongoose")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { oid } = require("../helpers/fixtures")

// Shaped as detectClashes returns them.
const clashFor = (projectId) => ({
  projectId,
  severity: "incompatible",
  clashTypes: ["geographic", "timeline", "worktype"],
  distance: 10,
})

test("a project pair can hold only one conflict row", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  const Conflict = require("../../src/models/Conflict")
  const { findOrCreateConflict } = require("../../src/services/clashSync")

  t.after(async () => { await dropAndDisconnect() })

  await clearCollections()
  // The unique index is the mechanism under test, so build it explicitly
  // rather than relying on autoIndex having finished.
  await Conflict.syncIndexes()

  await t.test("the pair key is order-independent", () => {
    const a = oid()
    const b = oid()

    assert.equal(
      Conflict.pairKeyFor(a, b),
      Conflict.pairKeyFor(b, a),
      "(A,B) and (B,A) are the same collision and must produce the same key"
    )
    assert.notEqual(
      Conflict.pairKeyFor(a, b),
      Conflict.pairKeyFor(a, oid()),
      "a different pair must produce a different key"
    )
  })

  await t.test("the same pair twice yields one row, and the second is not reported as created", async () => {
    await clearCollections()
    const [a, b] = [oid(), oid()]

    const first = await findOrCreateConflict(a, clashFor(b))
    const second = await findOrCreateConflict(a, clashFor(b))

    assert.equal(first.created, true, "the first call creates the row")
    assert.equal(second.created, false, "the second must not report a creation, or it re-notifies")
    assert.equal(String(first.conflict._id), String(second.conflict._id))
    assert.equal(await Conflict.countDocuments(), 1)
  })

  await t.test("the reversed pair resolves to the existing row and leaves its stored order alone", async () => {
    await clearCollections()
    const [a, b] = [oid(), oid()]

    const forward = await findOrCreateConflict(a, clashFor(b))
    const reversed = await findOrCreateConflict(b, clashFor(a))

    assert.equal(reversed.created, false, "the reverse ordering is the same collision")
    assert.equal(String(forward.conflict._id), String(reversed.conflict._id))
    assert.equal(await Conflict.countDocuments(), 1)

    // The API shape is unchanged: pairKey governs identity, the two reference
    // fields keep whatever order the detector supplied first.
    const stored = await Conflict.findById(forward.conflict._id).lean()
    assert.equal(String(stored.project1), String(a))
    assert.equal(String(stored.project2), String(b))
  })

  await t.test("concurrent writers for one pair still produce exactly one row", async () => {
    await clearCollections()
    const [a, b] = [oid(), oid()]

    // Both orderings in the same burst, so the test also covers the reversed
    // race rather than only the identical one.
    const results = await Promise.all([
      findOrCreateConflict(a, clashFor(b)),
      findOrCreateConflict(b, clashFor(a)),
      findOrCreateConflict(a, clashFor(b)),
      findOrCreateConflict(b, clashFor(a)),
      findOrCreateConflict(a, clashFor(b)),
      findOrCreateConflict(b, clashFor(a)),
    ])

    assert.equal(
      await Conflict.countDocuments(), 1,
      "a read-then-write would leave several rows here; the unique index must collapse them to one"
    )
    assert.equal(
      results.filter((r) => r.created).length, 1,
      "exactly one caller may report a creation, or the pair is announced more than once"
    )
    for (const r of results) {
      assert.ok(r.conflict, "a caller that lost the race must still receive the winning row, not null")
      assert.equal(String(r.conflict._id), String(results[0].conflict._id))
    }
  })

  await t.test("distinct pairs are unaffected and still create their own rows", async () => {
    await clearCollections()
    const [a, b, c] = [oid(), oid(), oid()]

    const ab = await findOrCreateConflict(a, clashFor(b))
    const ac = await findOrCreateConflict(a, clashFor(c))
    const bc = await findOrCreateConflict(b, clashFor(c))

    assert.equal(await Conflict.countDocuments(), 3, "three different collisions are three rows")
    for (const r of [ab, ac, bc]) assert.equal(r.created, true)
    assert.equal(new Set([ab, ac, bc].map((r) => String(r.conflict._id))).size, 3)
  })

  await t.test("the database refuses a duplicate even when the service is bypassed", async () => {
    await clearCollections()
    const [a, b] = [oid(), oid()]
    await findOrCreateConflict(a, clashFor(b))

    // Straight through the driver, so this proves the index rather than the
    // application logic sitting in front of it.
    await assert.rejects(
      () => mongoose.connection.collection("conflicts").insertOne({
        project1: b, project2: a,
        pairKey: Conflict.pairKeyFor(b, a),
        status: "pending",
      }),
      (err) => err.code === 11000,
      "the unique index must reject the row, whatever wrote it"
    )
    assert.equal(await Conflict.countDocuments(), 1)
  })
})
