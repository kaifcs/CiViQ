// The single source of truth for API response shapes. Errors are uniform, with
// `message` duplicated at the top level so both historical shapes stay subsets.
// Success payloads are deliberately not converged, to avoid a breaking change.

const { logger } = require("./logger")

const ERROR_CODES = {
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_ACCOUNT_DEACTIVATED: "AUTH_ACCOUNT_DEACTIVATED",

  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_ID: "INVALID_ID",
  CONFLICT: "CONFLICT",
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",

  NOT_FOUND: "NOT_FOUND",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  COMPLAINT_NOT_FOUND: "COMPLAINT_NOT_FOUND",
  CONFLICT_NOT_FOUND: "CONFLICT_NOT_FOUND",
  DEPARTMENT_NOT_FOUND: "DEPARTMENT_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  NOTIFICATION_NOT_FOUND: "NOTIFICATION_NOT_FOUND",
  AUDIT_LOG_NOT_FOUND: "AUDIT_LOG_NOT_FOUND",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",

  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
}

const isProduction = () => process.env.NODE_ENV === "production"

// `details` is dropped in production so validation internals never reach a client.
function fail(res, status, code, message, details) {
  const error = { code, message }
  if (details !== undefined && !isProduction()) error.details = details
  return res.status(status).json({ success: false, error, message })
}

const badRequest = (res, message, code = ERROR_CODES.VALIDATION_ERROR, details) =>
  fail(res, 400, code, message, details)

const invalidId = (res, label = "resource") =>
  fail(res, 400, ERROR_CODES.INVALID_ID, `Invalid ${label} ID`)

const unauthorized = (res, message = "Not authorized", code = ERROR_CODES.AUTH_UNAUTHORIZED) =>
  fail(res, 401, code, message)

const forbidden = (res, message = "Forbidden", code = ERROR_CODES.AUTH_FORBIDDEN) =>
  fail(res, 403, code, message)

const notFound = (res, message = "Not found", code = ERROR_CODES.NOT_FOUND) =>
  fail(res, 404, code, message)

// Named `conflictError`, not `conflict`: the conflicts controller holds a local
// `conflict` document that a bare import would shadow.
const conflictError = (res, message, code = ERROR_CODES.CONFLICT) =>
  fail(res, 409, code, message)

// The real message is logged but surfaced only outside production, so
// operational detail never leaks from a live deployment.
function serverError(res, err, context) {
  logger.error(context || "Request failed", {
    kind: "infrastructure",
    name: err?.name,
    error: err?.message || String(err),
    stack: err?.stack,
  })
  const message = isProduction()
    ? "Something went wrong. Please try again."
    : err?.message || "Server error"
  return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, message)
}

// Translates a Mongoose write failure into the right status and code.
function sendWriteError(res, err, { resource = "record", context } = {}) {
  if (err?.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : "identifier"
    return conflictError(
      res,
      `A ${resource} with that ${field} already exists`,
      ERROR_CODES.DUPLICATE_RESOURCE
    )
  }
  if (err?.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message)
    return badRequest(res, messages.join(", "), ERROR_CODES.VALIDATION_ERROR, messages)
  }
  // Validate coordinates at the schema level so all write paths share the same bounds.
  if (err?.name === "CastError") {
    return badRequest(res, `Invalid value for ${err.path}`, ERROR_CODES.VALIDATION_ERROR)
  }
  return serverError(res, err, context)
}

module.exports = {
  ERROR_CODES,
  fail,
  badRequest,
  invalidId,
  unauthorized,
  forbidden,
  notFound,
  conflictError,
  serverError,
  sendWriteError,
}
