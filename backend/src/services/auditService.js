// The only writer to the audit trail.
//
// Recording must never fail the operation being recorded: a controller awaits
// recordAudit after its business write has already succeeded, so a failure here
// is logged and swallowed rather than turning a completed action into an error
// response. The same contract the notification dispatchers follow.

const AuditLog = require("../models/AuditLog")
const { logger } = require("../utils/logger")

/**
 * The address to record against an audited action.
 *
 * Taken from req.ip, which Express derives according to the `trust proxy`
 * setting in app.js. Reading x-forwarded-for directly — as this did — meant any
 * client could set the header and choose the address written to an append-only
 * trail, whether a proxy was present or not. Deferring to req.ip makes the
 * value only as trusted as the deployment says it is: the socket address when
 * no proxy is configured, and the forwarded client address when one is.
 */
function getClientIp(req) {
  if (!req) return undefined
  return req.ip || req.socket?.remoteAddress || undefined
}

// Failures are logged and swallowed: an audit write must never fail the
// operation being audited.
async function recordAudit({ req, action, performedBy, targetType, targetId, details, isOverride = false }) {
  try {
    return await AuditLog.create({
      action,
      performedBy: performedBy || req?.user?._id,
      targetType,
      targetId,
      details,
      isOverride,
      ipAddress: getClientIp(req),
    })
  } catch (err) {
    logger.error(`Audit write failed for action "${action}"`, { error: err.message })
    return null
  }
}

module.exports = { recordAudit, getClientIp }
