// A user is not notified about their own complaint action.
//
// Officers work their queue by advancing status on complaints assigned to
// them, so notifying the assigned officer unconditionally told them about
// their own clicks. Suppression lives in notificationService, driven by an
// `actor` the producer supplies — so these tests assert both directions:
// someone else's action still notifies, your own does not.

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { userDoc, departmentDoc } = require("../helpers/fixtures")

const PASSWORD = "civiq123"

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

test("complaint notifications skip the actor", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  const app = require("../../src/app")
  const User = require("../../src/models/User")
  const Complaint = require("../../src/models/Complaint")
  const Department = require("../../src/models/Department")
  const Notification = require("../../src/models/Notification")

  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}/api`

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await dropAndDisconnect()
  })

  await clearCollections()

  const department = await Department.create(departmentDoc())
  const mk = async (role, email) => {
    const user = new User(userDoc({ role, email, department: String(department._id) }))
    await user.save()
    return user
  }
  // Created so the admin token below can be issued; only the token is used.
  await mk("admin", "sn-admin@s5.test")
  const officer = await mk("officer", "sn-officer@s5.test")
  const other = await mk("officer", "sn-other@s5.test")

  const call = async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }

  const login = async (email) => {
    const res = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } })
    assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`)
    return res.body.token
  }

  const tokens = {
    admin: await login("sn-admin@s5.test"),
    officer: await login("sn-officer@s5.test"),
    other: await login("sn-other@s5.test"),
  }

  const newComplaint = (assignedOfficer) => Complaint.create({
    issueType: "pothole",
    description: "fixture",
    location: { ward: "Ward 3", coords: { lat: 28.6692, lng: 77.4538 } },
    ...(assignedOfficer ? { assignedOfficer } : {}),
  })

  // Delivery is queued off the request path, so let the microtask settle.
  const notificationsFor = async (recipient, type) => {
    await new Promise((r) => setTimeout(r, 50))
    return Notification.find({ recipient, type }).lean()
  }

  await t.test("an officer advancing their own complaint is not notified", async () => {
    await Notification.deleteMany({})
    const complaint = await newComplaint(officer._id)

    const res = await call(`/complaints/${complaint._id}/status`, {
      token: tokens.officer, method: "PATCH", body: { status: "in_progress" },
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.status, "in_progress", "the status change itself must still happen")

    assert.deepEqual(
      await notificationsFor(officer._id, "complaint_status_changed"), [],
      "the officer performed this action; telling them about it is noise"
    )
  })

  await t.test("an admin advancing someone else's complaint still notifies the officer", async () => {
    await Notification.deleteMany({})
    const complaint = await newComplaint(officer._id)

    const res = await call(`/complaints/${complaint._id}/status`, {
      token: tokens.admin, method: "PATCH", body: { status: "acknowledged" },
    })
    assert.equal(res.status, 200)

    const notes = await notificationsFor(officer._id, "complaint_status_changed")
    assert.equal(notes.length, 1, "a third party's action must still reach the assigned officer")
    assert.match(notes[0].message, /acknowledged/)
  })

  await t.test("an officer assigning a complaint to themselves is not notified", async () => {
    await Notification.deleteMany({})
    const complaint = await newComplaint(null)

    const res = await call(`/complaints/${complaint._id}/assign`, {
      token: tokens.officer, method: "PATCH", body: { assignedOfficer: String(officer._id) },
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(String(res.body.assignedOfficer), String(officer._id), "the assignment must still be written")

    assert.deepEqual(
      await notificationsFor(officer._id, "complaint_assigned"), [],
      "self-assignment is already known to the assigner"
    )
  })

  await t.test("assigning a complaint to a different officer still notifies them", async () => {
    await Notification.deleteMany({})
    const complaint = await newComplaint(null)

    const res = await call(`/complaints/${complaint._id}/assign`, {
      token: tokens.officer, method: "PATCH", body: { assignedOfficer: String(other._id) },
    })
    assert.equal(res.status, 200)

    assert.equal(
      (await notificationsFor(other._id, "complaint_assigned")).length, 1,
      "the assignee did not perform the action and must be told"
    )
    assert.deepEqual(
      await notificationsFor(officer._id, "complaint_assigned"), [],
      "the assigner is not the recipient and gets nothing either way"
    )
  })

  await t.test("PUT /:id honours the same rule as the dedicated routes", async () => {
    await Notification.deleteMany({})
    const complaint = await newComplaint(null)

    const res = await call(`/complaints/${complaint._id}`, {
      token: tokens.officer, method: "PUT", body: { assignedOfficer: String(officer._id) },
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))

    assert.deepEqual(
      await notificationsFor(officer._id, "complaint_assigned"), [],
      "the general update route must not reintroduce the self-notification"
    )
  })

  await t.test("suppression is opt-in: a producer that names no actor still self-notifies", async () => {
    await Notification.deleteMany({})
    const { createNotification } = require("../../src/services/notificationService")

    // This is the clash_detected shape: an officer whose own new project
    // collides is deliberately told about their own creation.
    const created = await createNotification({
      recipient: officer._id,
      type: "clash_detected",
      title: "Clash Detected",
      message: "fixture",
    })

    assert.ok(created, "a payload with no actor must be delivered, whoever the recipient is")
    assert.equal(
      (await notificationsFor(officer._id, "clash_detected")).length, 1,
      "blanket suppression would break the deliberate self-notification on clash detection"
    )
  })

  await t.test("the actor is not persisted on the notification", async () => {
    await Notification.deleteMany({})
    const complaint = await newComplaint(officer._id)

    await call(`/complaints/${complaint._id}/status`, {
      token: tokens.admin, method: "PATCH", body: { status: "resolved" },
    })

    const [note] = await notificationsFor(officer._id, "complaint_status_changed")
    assert.ok(note, "precondition: the notification was raised")
    assert.equal(note.actor, undefined, "actor is a routing hint, not part of the record")
  })
})
