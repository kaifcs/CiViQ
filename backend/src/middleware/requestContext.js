// Request correlation and timing. The id is held in async storage, which is what
// lets the services emit correlated logs without threading it through their
// signatures. An inbound id is reused so a trace survives a proxy or a retry.

const crypto = require("node:crypto")
const { logger, runWithContext } = require("../utils/logger")

const HEADER = "x-request-id"
const SLOW_REQUEST_MS = 1000

// Accepted only if short and plain, so log lines cannot be forged.
function inboundId(req) {
  const raw = req.headers[HEADER]
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return /^[A-Za-z0-9._-]{8,64}$/.test(trimmed) ? trimmed : null
}

function requestContext(req, res, next) {
  const requestId = inboundId(req) || crypto.randomUUID()
  req.requestId = requestId
  // Echoed so a client, or a user reporting a fault, can quote the id.
  res.setHeader("X-Request-Id", requestId)

  const startedAt = process.hrtime.bigint()

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const fields = {
      method: req.method,
      // The route pattern, not the populated path, so ids do not fan out log
      // cardinality.
      route: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    }
    if (durationMs >= SLOW_REQUEST_MS) logger.warn("Slow request", fields)
    else logger.debug("Request completed", fields)
  })

  // The request is carried so the logger can resolve the principal later, once
  // `protect` has attached it.
  return runWithContext({ requestId, req }, () => next())
}

module.exports = { requestContext, SLOW_REQUEST_MS }
