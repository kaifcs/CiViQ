// Terminal handler for unmatched routes, so an unknown URL returns the standard
// JSON envelope rather than Express's default HTML page.

const { ERROR_CODES } = require("../utils/apiResponse")

function notFound(req, res) {
  const message = `Route not found: ${req.method} ${req.originalUrl}`
  res.status(404).json({
    success: false,
    // Retained for consumers written against the older shape.
    status: "error",
    error: { code: ERROR_CODES.ROUTE_NOT_FOUND, message },
    message,
  })
}

module.exports = notFound
