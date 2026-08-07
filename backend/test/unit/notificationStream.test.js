// The SSE hub. Transport only: who is connected, who receives an event, and
// whether a released connection lets go of its heartbeat timer.

const test = require("node:test")
const assert = require("node:assert/strict")
const { mockRes, mockReq, written } = require("../helpers/http")
const { oid } = require("../helpers/fixtures")

const stream = require("../../src/services/notificationStream")

// The hub is module-level state shared by every test in this file, so each test
// starts from an empty one. No test may depend on another's connections.
test.beforeEach(() => stream.closeAll())
test.after(() => stream.closeAll())

function connect(recipientId) {
  const req = mockReq()
  const res = mockRes()
  const cleanup = stream.addConnection(recipientId, req, res)
  return { req, res, cleanup }
}

test("a connection opens with SSE headers and a retry hint", () => {
  const { res } = connect(oid())
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers["content-type"], "text/event-stream")
  // Without no-transform the compression middleware buffers the stream and
  // nothing reaches the client until the response ends.
  assert.match(res.headers["cache-control"], /no-transform/)
  assert.equal(res.headers["x-accel-buffering"], "no")
  assert.match(written(res), /retry: 5000/)
})

test("stats report connected recipients and sockets", () => {
  const a = oid()
  connect(a)
  connect(a)
  connect(oid())
  assert.deepEqual(stream.stats(), { recipients: 2, connections: 3 })
})

test("an event reaches every tab of its recipient exactly once", () => {
  const recipient = oid()
  const tabs = [connect(recipient), connect(recipient)]
  const delivered = stream.publish(recipient, "notification.created", { id: "n1" }, "n1")

  assert.equal(delivered, 2)
  for (const tab of tabs) {
    const frames = written(tab.res)
    assert.equal(frames.match(/event: notification\.created/g).length, 1, "delivered twice")
    assert.match(frames, /data: \{"id":"n1"\}/)
    assert.match(frames, /id: n1/)
  }
})

test("an event never reaches another recipient", () => {
  const mine = connect(oid())
  const theirs = connect(oid())
  stream.publish(oid(), "notification.created", { id: "n1" })
  assert.doesNotMatch(written(mine.res), /notification\.created/)
  assert.doesNotMatch(written(theirs.res), /notification\.created/)
})

test("publishing to nobody is harmless", () => {
  assert.equal(stream.publish(oid(), "notification.created", { id: "x" }), 0)
  assert.equal(stream.publish(null, "notification.created", { id: "x" }), 0)
  assert.equal(stream.publish(undefined, "notification.created", {}), 0)
})

test("a client disconnect releases its slot", () => {
  const recipient = oid()
  const { req } = connect(recipient)
  assert.equal(stream.stats().connections, 1)
  req.emit("close")
  assert.deepEqual(stream.stats(), { recipients: 0, connections: 0 })
})

test("teardown is idempotent", () => {
  const { req, cleanup } = connect(oid())
  cleanup()
  req.emit("close")
  cleanup()
  assert.equal(stream.stats().connections, 0)
})

// A single client must not be able to exhaust the process by opening tabs.
test("connections per user are capped, evicting oldest first", () => {
  const recipient = oid()
  const cap = stream.MAX_CONNECTIONS_PER_USER
  const opened = []
  for (let i = 0; i < cap + 3; i++) opened.push(connect(recipient))

  assert.equal(stream.stats().connections, cap, "cap exceeded")
  assert.ok(opened[0].res.ended, "the oldest connection should have been evicted")
  assert.equal(opened.at(-1).res.ended, false, "the newest connection should survive")
})

test("id is omitted from the frame when none is supplied", () => {
  const recipient = oid()
  const { res } = connect(recipient)
  stream.publish(recipient, "notification.read_all", { updated: 3 })
  const frame = written(res)
  assert.match(frame, /event: notification\.read_all/)
  assert.doesNotMatch(frame, /^id: /m)
})

// Shutdown must route through each connection's own teardown, or heartbeat
// intervals survive and hold the event loop open. Asserted two ways: the hub
// empties, and this file's own clean exit shows no timer was left behind.
test("regression: closeAll releases connections through their own teardown (N4 timer leak)", () => {
  const recipients = [oid(), oid(), oid()]
  const all = recipients.flatMap((r) => [connect(r), connect(r)])
  assert.equal(stream.stats().connections, 6)

  stream.closeAll()

  assert.deepEqual(stream.stats(), { recipients: 0, connections: 0 })
  for (const c of all) {
    assert.ok(c.res.ended, "every response must be ended")
  }
  // Had the heartbeats survived, they would still be scheduled here. An unref'd
  // or cleared timer leaves nothing pending that can hold the loop open.
  const pending = process.getActiveResourcesInfo().filter((r) => r === "Timeout")
  assert.equal(pending.length, 0, `heartbeat timers still active: ${pending.length}`)
})

test("closeAll on an empty hub is safe", () => {
  stream.closeAll()
  assert.deepEqual(stream.stats(), { recipients: 0, connections: 0 })
})
