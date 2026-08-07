// The unhandled-error middleware: the last line before a client sees a failure,
// so a fault here turns every unexpected error into a second, worse one. The
// happy path and the production guard are both pinned.

const test = require("node:test")
const assert = require("node:assert/strict")
const { mockRes, mockReq } = require("../helpers/http")
const { ERROR_CODES } = require("../../src/utils/apiResponse")

const errorMiddleware = require("../../src/middleware/error")

const run = (err, env) => {
  const original = process.env.NODE_ENV
  if (env) process.env.NODE_ENV = env
  const res = mockRes()
  try {
    errorMiddleware(err, mockReq(), res, () => {})
  } finally {
    process.env.NODE_ENV = original
  }
  return res
}

// Express selects error handlers by arity. Losing the fourth parameter would
// silently demote this to ordinary middleware and every unhandled error would
// fall through to a default HTML response.
test("keeps the four-parameter signature Express requires", () => {
  assert.equal(errorMiddleware.length, 4)
})

test("an error without a status becomes a 500 in the standard envelope", () => {
  const res = run(new Error("boom"))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.success, false)
  assert.equal(res.body.error.code, ERROR_CODES.INTERNAL_ERROR)
  assert.equal(res.body.message, "boom")
  assert.equal(res.body.error.message, "boom")
})

test("an explicit status is honoured", () => {
  const err = Object.assign(new Error("nope"), { status: 403 })
  assert.equal(run(err).statusCode, 403)
})

test("a string code is preserved; a non-string code falls back", () => {
  const withCode = Object.assign(new Error("dup"), { code: "DUPLICATE_RESOURCE" })
  assert.equal(run(withCode).body.error.code, "DUPLICATE_RESOURCE")

  // Mongo driver errors carry a NUMERIC code (11000). Emitting that as the API
  // error code would break the contract, which promises a string.
  const numeric = Object.assign(new Error("dup"), { code: 11000 })
  assert.equal(run(numeric).body.error.code, ERROR_CODES.INTERNAL_ERROR)
})

test("a missing message falls back rather than emitting undefined", () => {
  const res = run(new Error())
  assert.equal(res.body.message, "Server error")
})

test("production never exposes a stack trace", () => {
  const res = run(new Error("boom"), "production")
  assert.equal(res.body.stack, undefined)
  assert.doesNotMatch(JSON.stringify(res.body), /\bat \w+/)
})

test("regression: a 5xx message is generalised in production", () => {
  const internal = "connect ECONNREFUSED 10.0.3.7:27017 — replica set 'civiq-prod'"
  const res = run(new Error(internal), "production")

  assert.equal(res.statusCode, 500)
  assert.equal(res.body.message, "Something went wrong. Please try again.")
  assert.equal(res.body.error.message, res.body.message, "both message fields must agree")
  assert.doesNotMatch(JSON.stringify(res.body), /ECONNREFUSED|27017|civiq-prod/)
})

test("a 4xx message still reaches the client in production", () => {
  const err = Object.assign(new Error("endDate cannot precede startDate"), { status: 400 })
  const res = run(err, "production")

  assert.equal(res.statusCode, 400)
  assert.equal(res.body.message, "endDate cannot precede startDate")
})

test("outside production a 5xx message is unchanged, for debugging", () => {
  for (const env of ["development", "test"]) {
    assert.equal(run(new Error("boom"), env).body.message, "boom", `${env} masked the message`)
  }
})

test("development includes the stack for debugging", () => {
  const res = run(new Error("boom"), "development")
  assert.ok(res.body.stack, "the stack aids local debugging")
})

test("test and staging environments are treated as non-development", () => {
  for (const env of ["test", "staging", "production"]) {
    assert.equal(run(new Error("boom"), env).body.stack, undefined, `${env} leaked a stack`)
  }
})

// The observable guarantee: the middleware always produces a response and never
// throws, whatever it is handed. A fault inside the error path would surface
// only as a broken response, so it is asserted directly.
test("regression: the handler responds instead of throwing (S3 temporal dead zone)", () => {
  const inputs = [
    new Error("standard"),
    Object.assign(new Error("with status"), { status: 400 }),
    { message: "a plain object, not an Error" },
    {},
  ]
  for (const err of inputs) {
    const res = mockRes()
    assert.doesNotThrow(
      () => errorMiddleware(err, mockReq(), res, () => {}),
      `threw while handling ${JSON.stringify(err?.message ?? err)}`
    )
    assert.equal(res.body.success, false)
    assert.ok(res.statusCode >= 400, "must respond with a failure status")
    assert.ok(res.body.error.code, "must always carry an error code")
  }
})
