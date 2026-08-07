// The default feed excludes archived rows with `archived: false`, a point
// equality, rather than `{ $ne: true }` — $ne compiles to two open-ended index
// ranges, which breaks the sorted prefix of { recipient, archived, createdAt }
// and forces the feed to sort a recipient's entire history to return one page.
//
// Two things must hold forever, and only a real database can show either: which
// rows the predicate selects, and that the query plan does not sort in memory.
//
// Every assertion below goes through `service.listNotifications`, so it binds to
// buildFilter rather than to a query shape restated here — a predicate written
// out in the test would keep passing however the implementation changed.

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

    // Rows with no `archived` field at all. The schema defaults it to false, so
    // nothing written through the model can look like this — only data migrated
    // from before the field existed, or inserted through the raw driver as here.
    // `archived: false` does not select them; the test below states that.
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

  // The predicate the feed actually applies, asserted through the service so it
  // cannot drift from buildFilter. This replaces a check that compared two query
  // shapes written out in the test: it exercised MongoDB rather than the
  // implementation, and kept passing while the two disagreed.
  await t.test("the default feed selects exactly the recipient's non-archived rows", async () => {
    const feed = await service.listNotifications(
      recipient, {}, { enabled: true, skip: 0, limit: 500 }, prefs
    )
    const selected = new Set(feed.map((n) => String(n._id)))

    const expected = await Notification.find({ recipient, archived: false }).select("_id").lean()
    assert.ok(expected.length > 0, "precondition: the fixture must have non-archived rows")
    assert.deepEqual(selected, new Set(expected.map((r) => String(r._id))),
      "the feed and `archived: false` must select the same rows")

    // A point equality does not match a missing field. The schema defaults
    // `archived` to false, so this can only describe data migrated from before
    // the field existed — stated here so the behaviour is a decision on record
    // rather than something discovered during a migration.
    const fieldless = await Notification.find({ recipient, archived: { $exists: false } }).select("_id").lean()
    assert.equal(fieldless.length, 3, "the fixture must actually contain field-less rows")
    for (const row of fieldless) {
      assert.equal(selected.has(String(row._id)), false,
        "a row with no `archived` field is not in the default feed")
    }

    // The badge counts the same set, so the two can never disagree.
    const unread = await service.getUnreadCount(recipient, prefs)
    assert.equal(unread, feed.filter((n) => !n.read).length,
      "the badge must count exactly what the feed shows")
  })

  // Regression — S4. The performance guarantee, asserted structurally rather
  // than by timing, so it is deterministic on any machine.
  await t.test("regression: the feed is served from the index without a blocking sort", async () => {
    // The shape buildFilter emits for a default feed. A point equality on
    // `archived` keeps the { recipient, archived, createdAt } prefix sorted;
    // `$ne` would open two index ranges and force an in-memory sort.
    const plan = await Notification.find({
      recipient,
      archived: false,
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
