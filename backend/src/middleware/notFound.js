// Terminal handler for unmatched routes.
//
// Registered after every router and before the error handler, so an unknown URL
// returns the standard JSON envelope instead of Express's default HTML page —
// which an API client cannot parse.

const { ERROR_CODES } = require("../utils/apiResponse")

function notFound(req, res) {
  const message = `Route not found: ${req.method} ${req.originalUrl}`
  res.status(404).json({
    success: false,
    // Carried alongside the standard envelope for consumers written against the
    // older shape; every other field matches the shared error contract.
    status: "error",
    error: { code: ERROR_CODES.ROUTE_NOT_FOUND, message },
    message,
  })
}

module.exports = notFound
