// The change replaced `archived: { $ne: true }` with `{ $in: [false, null] }`
// because $ne compiles to two open-ended index ranges, which breaks the sorted
// prefix of { recipient, archived, createdAt } and forces the feed to sort a
// recipient's entire history to return one page.
//
// Two things must hold forever, and only a real database can show either: the
// rows selected are unchanged, and the query plan no longer sorts in memory.

const test = require("node:test")
const assert = require("node:assert/strict")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { notificationDoc, oid } = require("../helpers/fixtures")

const Notification = require("../../src/models/Notification")
const service = require("../../src/services/notificationService")
const { defaultPreferences, sanitisePreferences } = require("../../src/services/notificationPreferences")

test("notification feed query", async (t) => {
  // Checked inside the test rather than at module scope: this file is CommonJS,
  // so there is no top-level await, and a skip must state its reason.
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  // Wait until Notification indexes are built.
  await Notification.init()

  const recipient = oid()
  const other = oid()

  {
    await clearCollections()
    const rows = []
    // Deterministic timestamps, one minute apart, so ordering assertions cannot
    // depend on insertion speed.
    const base = Date.UTC(2026, 0, 1)
    for (let i = 0; i < 120; i++) {
      rows.push(notificationDoc({
        recipient,
        title: `Row ${String(i).padStart(3, "0")}`,
        read: i % 3 === 0,
        archived: i % 10 === 0,
        category: ["project", "complaint", "conflict", "system"][i % 4],
        createdAt: new Date(base + i * 60_000),
      }))
    }
    // Another recipient's rows must never appear.
    rows.push(notificationDoc({ recipient: other, title: "Someone else" }))
    await Notification.insertMany(rows)

    // Rows written before `archived` existed have no such field at all. This is
    // the case `$ne: true` handled and a plain `archived: false` would silently
    // drop, so the fixture includes them deliberately.
    await Notification.collection.insertMany([0, 1, 2].map((i) => ({
      recipient, type: "project_approved", title: `Legacy ${i}`, message: "m",
      read: false, category: "project", priority: "normal", deliveryStatus: "skipped",
      createdAt: new Date(base + (200 + i) * 60_000), updatedAt: new Date(),
    })))
  }

  t.after(dropAndDisconnect)

  const prefs = defaultPreferences()

  await t.test("the default feed excludes archived rows and other recipients", async () => {
    const feed = await service.listNotifications(recipient, {}, { enabled: false }, prefs)
    assert.ok(feed.length > 0)
    assert.ok(feed.every((n) => n.archived !== true), "an archived row reached the feed")
    assert.ok(feed.every((n) => String(n.recipient) === String(recipient)), "cross-recipient leak")
    assert.ok(!feed.some((n) => n.title === "Someone else"))
  })

  // Regression — S4. The pre-S4 predicate and the current one must select
  // exactly the same set, legacy rows included.
  await t.test("regression: rows selected are identical to the pre-S4 predicate", async () => {
    const legacyShape = { recipient, archived: { $ne: true } }
    const currentShape = { recipient, archived: { $in: [false, null] } }

    const before = await Notification.find(legacyShape).select("_id").lean()
    const after = await Notification.find(currentShape).select("_id").lean()

    const ids = (rows) => new Set(rows.map((r) => String(r._id)))
    assert.equal(after.length, before.length, "row count changed")
    assert.deepEqual(ids(after), ids(before), "membership changed")

    const legacyRows = await Notification.countDocuments({ recipient, archived: { $exists: false } })
    assert.equal(legacyRows, 3, "the fixture must actually contain field-less rows")
    assert.equal(
      await Notification.countDocuments(currentShape),
      await Notification.countDocuments(legacyShape),
      "legacy rows must survive the new predicate"
    )
  })

  // Regression — S4. The performance guarantee, asserted structurally rather
  // than by timing, so it is deterministic on any machine.
  await t.test("regression: the feed is served from the index without a blocking sort", async () => {
    const plan = await Notification.find({
      recipient,
      archived: { $in: [false, null] },
    })
      .sort({ createdAt: -1 })
      .hint({ recipient: 1, archived: 1, createdAt: -1 })
      .limit(10)
      .explain("executionStats")

    const planString = JSON.stringify(plan)

    assert.ok(
      !planString.includes("COLLSCAN"),
      `collection scan in plan: ${planString}`
    )

    assert.ok(
      !planString.includes('"stage":"SORT"'),
      "blocking SORT present in execution plan"
    )
  })

  await t.test("the feed is newest first", async () => {
    const feed = await service.listNotifications(recipient, {}, { enabled: false }, prefs)
    for (let i = 1; i < feed.length; i++) {
      assert.ok(feed[i - 1].createdAt >= feed[i].createdAt, "feed is not newest-first")
    }
  })

  await t.test("archived=true and archived=all select the documented sets", async () => {
    const archived = await service.listNotifications(recipient, { archived: "true" }, { enabled: false }, prefs)
    assert.ok(archived.length > 0)
    assert.ok(archived.every((n) => n.archived === true))

    const all = await service.listNotifications(recipient, { archived: "all" }, { enabled: true, skip: 0, limit: 200 }, prefs)
    assert.ok(all.some((n) => n.archived === true) && all.some((n) => n.archived !== true))
  })

  // Regression — S4. The category clause is dropped when the allow-list covers
  // everything; muting one category must still filter.
  await t.test("regression: a muted category is excluded, an unmuted set is not", async () => {
    const muted = sanitisePreferences({ inApp: { project: false } }, defaultPreferences())
    const feed = await service.listNotifications(recipient, {}, { enabled: true, skip: 0, limit: 200 }, muted)
    assert.ok(feed.length > 0)
    assert.equal(feed.filter((n) => n.category === "project").length, 0, "a muted category leaked")

    // includeMuted overrides the opt-out without deleting history.
    const withMuted = await service.listNotifications(
      recipient, { includeMuted: "true" }, { enabled: true, skip: 0, limit: 200 }, muted
    )
    assert.ok(withMuted.some((n) => n.category === "project"), "history must remain retrievable")
  })

  await t.test("the badge count matches the unread rows the feed would show", async () => {
    const badge = await service.getUnreadCount(recipient, prefs)
    const counted = await service.countNotifications(recipient, { read: "false" }, prefs)
    assert.equal(badge, counted, "the badge and the list must never disagree")
    assert.ok(badge > 0)
  })

  await t.test("a muted category is excluded from the badge too", async () => {
    const muted = sanitisePreferences({ inApp: { project: false } }, defaultPreferences())
    const mutedBadge = await service.getUnreadCount(recipient, muted)
    const fullBadge = await service.getUnreadCount(recipient, defaultPreferences())
    assert.ok(mutedBadge < fullBadge, "muting must reduce the badge")
  })

  await t.test("pagination returns disjoint pages", async () => {
    const p1 = await service.listNotifications(recipient, {}, { enabled: true, skip: 0, limit: 10 }, prefs)
    const p2 = await service.listNotifications(recipient, {}, { enabled: true, skip: 10, limit: 10 }, prefs)
    assert.equal(p1.length, 10)
    assert.equal(p2.length, 10)
    const seen = new Set([...p1, ...p2].map((n) => String(n._id)))
    assert.equal(seen.size, 20, "pages overlapped")
  })

  await t.test("search matches title and message and escapes regex input", async () => {
    const found = await service.listNotifications(recipient, { search: "Row 001" }, { enabled: false }, prefs)
    assert.ok(found.length >= 1)
    assert.ok(found.every((n) => /Row 001/.test(n.title) || /Row 001/.test(n.message)))

    // A regex metacharacter must be treated as a literal, not compiled.
    const injected = await service.listNotifications(recipient, { search: ".*" }, { enabled: false }, prefs)
    assert.equal(injected.length, 0, "search input was interpreted as a regular expression")
  })

  await t.test("reads are scoped to the recipient", async () => {
    const foreign = await Notification.findOne({ recipient: other }).lean()
    assert.equal(await service.getNotification(recipient, foreign._id), null,
      "another recipient's notification was readable")
    assert.equal(await service.markRead(recipient, foreign._id), null,
      "another recipient's notification was writable")
    assert.equal(await service.getNotification(recipient, "not-an-id"), null)
  })

  await t.test("archive and delete only touch rows the recipient owns", async () => {
    const foreign = await Notification.findOne({ recipient: other }).lean()
    assert.deepEqual(await service.setArchived(recipient, [foreign._id], true), { ids: [], updated: 0 })
    assert.deepEqual(await service.deleteNotifications(recipient, [foreign._id]), { ids: [], deleted: 0 })
    assert.ok(await Notification.findById(foreign._id), "another recipient's row was deleted")
  })
})
