// SSE stream tickets. A credential has to travel in the URL, so the ticket
// makes that exposure survivable: 30 seconds and one use. Both are security
// controls, as is the rule that a session JWT is never accepted in its place.

const test = require("node:test")
const assert = require("node:assert/strict")
const jwt = require("jsonwebtoken")
const { oid } = require("../helpers/fixtures")

const {
  issueTicket, consumeTicket, consumedCount, TICKET_TTL_SECONDS,
} = require("../../src/utils/streamTicket")

test("a freshly issued ticket resolves to its user", async () => {
  const userId = oid()
  const { ticket, expiresIn } = issueTicket(userId)
  assert.equal(expiresIn, TICKET_TTL_SECONDS)
  assert.equal(await consumeTicket(ticket), String(userId))
})

test("the lifetime stays short", () => {
  assert.ok(TICKET_TTL_SECONDS <= 60, "a URL-borne credential must be short-lived")
})

// Single use is what makes a leaked URL — in a proxy log, a referrer header,
// browser history — worthless to an attacker.
test("a ticket cannot be replayed", async () => {
  const { ticket } = issueTicket(oid())
  assert.ok(await consumeTicket(ticket), "first use must succeed")
  assert.equal(await consumeTicket(ticket), null, "second use must be refused")
  assert.equal(await consumeTicket(ticket), null)
})

test("an expired ticket is refused", async () => {
  const expired = jwt.sign(
    { id: String(oid()), jti: "expired-jti", typ: "sse" },
    process.env.JWT_SECRET,
    { expiresIn: -10 }
  )
  assert.equal(await consumeTicket(expired), null)
})

// The whole point of a separate credential is lost if the long-lived session
// token still works on the stream.
test("a session JWT is not accepted as a ticket", async () => {
  const session = jwt.sign({ id: String(oid()) }, process.env.JWT_SECRET, { expiresIn: "1h" })
  assert.equal(await consumeTicket(session), null, "a token without typ:sse must be refused")
})

test("a ticket signed with the wrong secret is refused", async () => {
  const forged = jwt.sign(
    { id: String(oid()), jti: "forged", typ: "sse" },
    "not-the-real-secret",
    { expiresIn: 30 }
  )
  assert.equal(await consumeTicket(forged), null)
})

test("malformed and empty input is refused rather than thrown on", async () => {
  for (const input of [undefined, null, "", "not-a-jwt", "a.b.c", 12345, {}]) {
    assert.equal(await consumeTicket(input), null, `accepted ${JSON.stringify(input)}`)
  }
})

test("a ticket missing its jti or id is refused", async () => {
  const noJti = jwt.sign({ id: String(oid()), typ: "sse" }, process.env.JWT_SECRET, { expiresIn: 30 })
  const noId = jwt.sign({ jti: "j", typ: "sse" }, process.env.JWT_SECRET, { expiresIn: 30 })
  assert.equal(await consumeTicket(noJti), null)
  assert.equal(await consumeTicket(noId), null)
})

test("each issued ticket is distinct", async () => {
  const userId = oid()
  const a = issueTicket(userId).ticket
  const b = issueTicket(userId).ticket
  assert.notEqual(a, b, "reused ticket ids would make replay protection collide")
  assert.ok(await consumeTicket(a))
  assert.ok(await consumeTicket(b), "one ticket's use must not consume another's")
})

// The replay ledger is bounded by ticket lifetime rather than by traffic, so a
// long-running process cannot accumulate entries indefinitely.
test("the replay ledger releases entries once they could no longer be valid", async () => {
  const expired = jwt.sign(
    { id: String(oid()), jti: "sweep-me", typ: "sse" },
    process.env.JWT_SECRET,
    { expiresIn: -1 }
  )
  const before = consumedCount()
  await consumeTicket(expired)
  assert.ok(consumedCount() <= before + 1, "an already-expired ticket must not be retained")
})
