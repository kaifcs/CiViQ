// Express selects error middleware by arity, so the unused fourth parameter
// below is required.
const { ERROR_CODES } = require("../utils/apiResponse")
const { logger } = require("../utils/logger")

module.exports = (err, req, res, _next) => {
  const status = err.status || 500
  const message = err.message || "Server error"

  // Anything reaching here was thrown rather than returned through the shared
  // helpers, so it is unexpected by definition.
  logger.error("Unhandled error", {
    kind: status >= 500 ? "infrastructure" : "business",
    status,
    name: err.name,
    error: message,
    stack: err.stack,
  })

  const isProduction = process.env.NODE_ENV === "production"
  const publicMessage =
    isProduction && status >= 500 ? "Something went wrong. Please try again." : message

  res.status(status).json({
    success: false,
    error: {
      code: err.code && typeof err.code === "string" ? err.code : ERROR_CODES.INTERNAL_ERROR,
      message: publicMessage,
    },
    message: publicMessage,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  })
}
