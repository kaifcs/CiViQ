const DEFAULT_LIMIT = 25
const MAX_LIMIT = 200

function parsePagination(query = {}) {
  const hasPage = query.page !== undefined && query.page !== ""
  const hasLimit = query.limit !== undefined && query.limit !== ""
  if (!hasPage && !hasLimit) return { enabled: false }

  let page = parseInt(query.page, 10)
  if (!Number.isFinite(page) || page < 1) page = 1

  let limit = parseInt(query.limit, 10)
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT
  if (limit > MAX_LIMIT) limit = MAX_LIMIT

  return { enabled: true, page, limit, skip: (page - 1) * limit }
}

// Pagination travels in headers because several list endpoints return a bare
// array; moving it into the body would break every existing consumer.
function setPaginationHeaders(res, total, { page, limit }) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  res.set("X-Total-Count", String(total))
  res.set("X-Page", String(page))
  res.set("X-Limit", String(limit))
  res.set("X-Total-Pages", String(totalPages))
  res.set("X-Has-Next", String(page < totalPages))
  res.set("X-Has-Previous", String(page > 1))
}

module.exports = { parsePagination, setPaginationHeaders, DEFAULT_LIMIT, MAX_LIMIT }
