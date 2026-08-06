// Request correlation and timing.
//
// One correlation id per request, reused from the caller when supplied so a
// trace survives across a proxy or a client retry, and generated only when
// absent. It is held in async storage, which is what lets NotificationService,
// EmailService, the SSE hub and the audit writer emit correlated logs without
// any of them changing signature.

const crypto = require("node:crypto")
const { logger, runWithContext } = require("../utils/logger")

const HEADER = "x-request-id"
// Anything slower than this is surfaced as a warning rather than left to be
// spotted in aggregate.
const SLOW_REQUEST_MS = 1000

/** Accepts an inbound id only if it is short and plain, so logs cannot be forged. */
function inboundId(req) {
  const raw = req.headers[HEADER]
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return /^[A-Za-z0-9._-]{8,64}$/.test(trimmed) ? trimmed : null
}

function requestContext(req, res, next) {
  const requestId = inboundId(req) || crypto.randomUUID()
  req.requestId = requestId
  // Echoed so a client — or a user reporting a fault — can quote the id.
  res.setHeader("X-Request-Id", requestId)

  const startedAt = process.hrtime.bigint()

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const fields = {
      method: req.method,
      // The route pattern, not the populated path, so ids do not fan out the
      // cardinality of the log stream.
      route: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    }
    if (durationMs >= SLOW_REQUEST_MS) logger.warn("Slow request", fields)
    else logger.debug("Request completed", fields)
  })

  // The request itself is carried so the logger can resolve the authenticated
  // principal later, once `protect` has attached it. Nothing else needs to be
  // mounted, and the auth middleware stays untouched.
  return runWithContext({ requestId, req }, () => next())
}

module.exports = { requestContext, SLOW_REQUEST_MS }
