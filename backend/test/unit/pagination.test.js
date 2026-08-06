// Pagination — the one strategy every list endpoint shares.
//
// Pagination travels in headers because several list endpoints return a bare
// array; moving it into the body would be a breaking API change. These tests
// pin both halves: how a query is parsed, and the exact header set emitted.

const test = require("node:test")
const assert = require("node:assert/strict")
const { mockRes } = require("../helpers/http")
const {
  parsePagination, setPaginationHeaders, DEFAULT_LIMIT, MAX_LIMIT,
} = require("../../src/utils/pagination")

// Opt-in is the contract: a caller that asks for no page gets the whole list,
// exactly as before pagination existed.
test("pagination stays off unless asked for", () => {
  assert.deepEqual(parsePagination({}), { enabled: false })
  assert.deepEqual(parsePagination({ page: "" }), { enabled: false })
  assert.deepEqual(parsePagination({ page: "", limit: "" }), { enabled: false })
  assert.deepEqual(parsePagination(undefined), { enabled: false })
})

test("either page or limit turns it on", () => {
  assert.equal(parsePagination({ page: "2" }).enabled, true)
  assert.equal(parsePagination({ limit: "10" }).enabled, true)
})

test("skip follows from page and limit", () => {
  assert.deepEqual(parsePagination({ page: "3", limit: "20" }),
    { enabled: true, page: 3, limit: 20, skip: 40 })
  assert.equal(parsePagination({ page: "1", limit: "25" }).skip, 0)
})

test("limit defaults when only a page is given", () => {
  const page = parsePagination({ page: "2" })
  assert.equal(page.limit, DEFAULT_LIMIT)
  assert.equal(page.skip, DEFAULT_LIMIT)
})

// An unbounded limit would let one request ask the database for everything.
test("limit is capped", () => {
  assert.equal(parsePagination({ limit: String(MAX_LIMIT + 1000) }).limit, MAX_LIMIT)
  assert.ok(MAX_LIMIT <= 500, "the ceiling must stay meaningful")
})

test("nonsense input falls back rather than producing a broken query", () => {
  for (const bad of ["0", "-5", "abc", "NaN", "1e9999"]) {
    const parsed = parsePagination({ page: bad, limit: bad })
    assert.ok(parsed.page >= 1, `page ${bad} -> ${parsed.page}`)
    assert.ok(parsed.limit >= 1 && parsed.limit <= MAX_LIMIT, `limit ${bad} -> ${parsed.limit}`)
    assert.ok(parsed.skip >= 0, `skip ${bad} -> ${parsed.skip}`)
    assert.ok(Number.isFinite(parsed.skip))
  }
})

test("a fractional page is truncated, not left fractional", () => {
  const parsed = parsePagination({ page: "2.7", limit: "10" })
  assert.ok(Number.isInteger(parsed.page))
  assert.ok(Number.isInteger(parsed.skip))
})

test("every list endpoint reports the same header set", () => {
  const res = mockRes()
  setPaginationHeaders(res, 100, { page: 2, limit: 25 })
  assert.deepEqual(res.headers, {
    "x-total-count": "100",
    "x-page": "2",
    "x-limit": "25",
    "x-total-pages": "4",
    "x-has-next": "true",
    "x-has-previous": "true",
  })
})

test("boundary pages report navigation correctly", () => {
  const first = mockRes()
  setPaginationHeaders(first, 100, { page: 1, limit: 25 })
  assert.equal(first.headers["x-has-previous"], "false")
  assert.equal(first.headers["x-has-next"], "true")

  const last = mockRes()
  setPaginationHeaders(last, 100, { page: 4, limit: 25 })
  assert.equal(last.headers["x-has-next"], "false")
  assert.equal(last.headers["x-has-previous"], "true")
})

// An empty collection must still report one page, or a client paginating from
// the headers would divide by zero or loop.
test("an empty result still reports one page", () => {
  const res = mockRes()
  setPaginationHeaders(res, 0, { page: 1, limit: 25 })
  assert.equal(res.headers["x-total-count"], "0")
  assert.equal(res.headers["x-total-pages"], "1")
  assert.equal(res.headers["x-has-next"], "false")
  assert.equal(res.headers["x-has-previous"], "false")
})

test("a partial final page is counted", () => {
  const res = mockRes()
  setPaginationHeaders(res, 101, { page: 1, limit: 25 })
  assert.equal(res.headers["x-total-pages"], "5")
})

test("headers are strings, as HTTP requires", () => {
  const res = mockRes()
  setPaginationHeaders(res, 10, { page: 1, limit: 5 })
  for (const [key, value] of Object.entries(res.headers)) {
    assert.equal(typeof value, "string", `${key} must be a string`)
  }
})
