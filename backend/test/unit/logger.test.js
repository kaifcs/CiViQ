// S3 — structured logging and secret redaction.
//
// The redaction rules are a security control, not formatting: a credential that
// reaches a log line has leaked. These tests cover both routes into a log —
// a secret-looking KEY, and a secret embedded in a string VALUE.

const test = require("node:test")
const assert = require("node:assert/strict")
const { scrub, runWithContext, currentContext, LEVELS } = require("../../src/utils/logger")

const REDACTED = "[REDACTED]"

test("secret-looking keys are redacted whatever their value", () => {
  const out = scrub({
    password: "hunter2",
    passwd: "hunter2",
    JWT_SECRET: "abc",
    accessToken: "xyz",
    refresh_token: "xyz",
    apiKey: "k",
    "api-key": "k",
    authorization: "Bearer abc",
    cookie: "session=1",
    credential: "c",
  })
  for (const [key, value] of Object.entries(out)) {
    assert.equal(value, REDACTED, `${key} was not redacted`)
  }
})

test("ordinary fields are preserved", () => {
  const out = scrub({ userId: "u1", role: "officer", status: 200, count: 3, ok: true })
  assert.deepEqual(out, { userId: "u1", role: "officer", status: 200, count: 3, ok: true })
})

test("credentials inside connection strings are redacted", () => {
  assert.equal(
    scrub("mongodb://civiq:s3cr3t@cluster0.mongodb.net/db"),
    `mongodb://civiq:${REDACTED}@cluster0.mongodb.net/db`
  )
  assert.equal(
    scrub("mongodb+srv://u:p@host/db"),
    `mongodb+srv://u:${REDACTED}@host/db`
  )
  assert.equal(scrub("redis://user:pw@127.0.0.1:6379"), `redis://user:${REDACTED}@127.0.0.1:6379`)
})

test("bearer tokens are redacted", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.c2lnbmF0dXJl"
  const out = scrub(`Authorization: Bearer ${jwt}`)
  assert.match(out, /Bearer \[REDACTED\]/)
  assert.doesNotMatch(out, /eyJhbGciOiJIUzI1NiJ9/)
})

test("tokens and tickets in query strings are redacted", () => {
  assert.match(scrub("GET /api/notifications/stream?ticket=abc123def"), /ticket=\[REDACTED\]/)
  assert.match(scrub("token=abc123def"), /token=\[REDACTED\]/)
  assert.doesNotMatch(scrub("GET /stream?ticket=abc123def"), /abc123def/)
})

test("redaction reaches nested objects and arrays", () => {
  const out = scrub({
    request: { headers: { authorization: "Bearer abc" }, safe: "keep" },
    items: [{ password: "p" }, { name: "n" }],
  })
  assert.equal(out.request.headers.authorization, REDACTED)
  assert.equal(out.request.safe, "keep")
  assert.equal(out.items[0].password, REDACTED)
  assert.equal(out.items[1].name, "n")
})

// A logger that throws while reporting an error would hide the original fault.
test("cyclic structures are tolerated rather than thrown on", () => {
  const node = { name: "a" }
  node.self = node
  const out = scrub(node)
  assert.equal(out.name, "a")
  assert.equal(out.self, "[Circular]")
})

test("dates serialise rather than becoming empty objects", () => {
  const out = scrub({ at: new Date("2026-01-02T03:04:05.000Z") })
  assert.equal(out.at, "2026-01-02T03:04:05.000Z")
})

test("primitives and nullish values survive unchanged", () => {
  assert.equal(scrub(null), null)
  assert.equal(scrub(undefined), undefined)
  assert.equal(scrub(42), 42)
  assert.equal(scrub(false), false)
})

// Correlation is what lets one request be followed across services without
// changing any service signature.
test("request context is readable inside the async scope and absent outside it", async () => {
  assert.deepEqual(currentContext(), {})
  await runWithContext({ requestId: "req-123" }, async () => {
    assert.equal(currentContext().requestId, "req-123")
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(currentContext().requestId, "req-123", "context must survive an async hop")
  })
  assert.deepEqual(currentContext(), {}, "context must not leak past its scope")
})

test("concurrent contexts do not bleed into one another", async () => {
  const seen = await Promise.all([
    runWithContext({ requestId: "a" }, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return currentContext().requestId
    }),
    runWithContext({ requestId: "b" }, async () => currentContext().requestId),
  ])
  assert.deepEqual(seen, ["a", "b"])
})

test("log levels are ordered fatal-first so filtering is predictable", () => {
  assert.ok(LEVELS.fatal < LEVELS.error)
  assert.ok(LEVELS.error < LEVELS.warn)
  assert.ok(LEVELS.warn < LEVELS.info)
  assert.ok(LEVELS.info < LEVELS.debug)
})
