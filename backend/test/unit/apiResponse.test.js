// The standardised error envelope. The duplicated top-level `message` is
// asserted deliberately: dropping it would break consumers that never migrated
// to `error.code`.

const test = require("node:test")
const assert = require("node:assert/strict")
const { mockRes } = require("../helpers/http")

const {
  ERROR_CODES, fail, badRequest, invalidId, unauthorized, forbidden,
  notFound, conflictError, serverError, sendWriteError,
} = require("../../src/utils/apiResponse")

test("every failure emits the same envelope", () => {
  const res = mockRes()
  fail(res, 418, ERROR_CODES.VALIDATION_ERROR, "teapot")
  assert.equal(res.statusCode, 418)
  assert.deepEqual(res.body, {
    success: false,
    error: { code: "VALIDATION_ERROR", message: "teapot" },
    message: "teapot",
  })
})

test("message is duplicated at the top level for pre-S1 consumers", () => {
  const res = mockRes()
  notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)
  assert.equal(res.body.message, res.body.error.message)
  assert.equal(res.body.success, false)
})

test("helpers map to their documented status codes", () => {
  const cases = [
    [badRequest, 400, ERROR_CODES.VALIDATION_ERROR],
    [unauthorized, 401, ERROR_CODES.AUTH_UNAUTHORIZED],
    [forbidden, 403, ERROR_CODES.AUTH_FORBIDDEN],
    [notFound, 404, ERROR_CODES.NOT_FOUND],
    [conflictError, 409, ERROR_CODES.CONFLICT],
  ]
  for (const [helper, status, code] of cases) {
    const res = mockRes()
    helper(res, "message")
    assert.equal(res.statusCode, status, `${helper.name} status`)
    assert.equal(res.body.error.code, code, `${helper.name} code`)
  }
})

test("invalidId labels the resource", () => {
  const res = mockRes()
  invalidId(res, "project")
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error.code, ERROR_CODES.INVALID_ID)
  assert.match(res.body.message, /project/i)
})

// The 409 helper is named `conflictError` because the conflicts controller
// holds a local `conflict` document a bare import would shadow — a runtime
// TypeError no linter can see, so the name is part of the contract.
test("regression: the 409 helper is exported as conflictError, not conflict", () => {
  const api = require("../../src/utils/apiResponse")
  assert.equal(typeof api.conflictError, "function")
  assert.equal(api.conflict, undefined, "a bare `conflict` export would shadow the document")
})

test("sendWriteError translates a duplicate key into 409", () => {
  const res = mockRes()
  sendWriteError(res, { code: 11000, keyValue: { projectId: "PRJ-1" } }, { resource: "project" })
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.error.code, ERROR_CODES.DUPLICATE_RESOURCE)
  assert.match(res.body.message, /project.*projectId/i)
})

test("sendWriteError translates a validation error into 400", () => {
  const res = mockRes()
  sendWriteError(res, {
    name: "ValidationError",
    errors: { title: { message: "Path `title` is required." } },
  })
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error.code, ERROR_CODES.VALIDATION_ERROR)
  assert.match(res.body.message, /title/)
})

test("sendWriteError falls back to 500 for anything else", () => {
  const res = mockRes()
  sendWriteError(res, new Error("socket hang up"))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, ERROR_CODES.INTERNAL_ERROR)
})

// Production must not leak internals. Both guards live in apiResponse, so they
// are asserted together against a restored NODE_ENV.
test("production hides validation details and server error text", (t) => {
  const original = process.env.NODE_ENV
  t.after(() => { process.env.NODE_ENV = original })

  process.env.NODE_ENV = "production"
  const withDetails = mockRes()
  badRequest(withDetails, "bad", ERROR_CODES.VALIDATION_ERROR, ["field is required"])
  assert.equal(withDetails.body.error.details, undefined, "details must not reach a client")

  const server = mockRes()
  serverError(server, new Error("ECONNREFUSED 10.0.0.5:27017"), "ctx")
  assert.doesNotMatch(server.body.message, /ECONNREFUSED|27017/, "internal detail leaked")
  assert.equal(server.body.error.code, ERROR_CODES.INTERNAL_ERROR)
})

test("outside production, details and messages aid debugging", (t) => {
  const original = process.env.NODE_ENV
  t.after(() => { process.env.NODE_ENV = original })
  process.env.NODE_ENV = "development"

  const res = mockRes()
  badRequest(res, "bad", ERROR_CODES.VALIDATION_ERROR, ["field is required"])
  assert.deepEqual(res.body.error.details, ["field is required"])
})

test("no error response ever carries a stack trace", () => {
  const res = mockRes()
  serverError(res, new Error("boom"), "ctx")
  assert.equal(res.body.stack, undefined)
  assert.doesNotMatch(JSON.stringify(res.body), /\bat \w+ \(/)
})
