// The only writer to the audit trail. Recording must never fail the operation
// being recorded, so a failure here is logged and swallowed rather than turning
// a completed action into an error response. The trail is therefore best-effort.

const AuditLog = require("../models/AuditLog")
const { logger } = require("../utils/logger")

// req.ip, so the recorded address is only as trusted as TRUST_PROXY says it is.
// Reading x-forwarded-for directly would let any caller choose what is written.
function getClientIp(req) {
  if (!req) return undefined
  return req.ip || req.socket?.remoteAddress || undefined
}

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
