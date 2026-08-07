// Short-lived, single-use credentials for the SSE stream. EventSource cannot set
// an Authorization header, so a ticket travels in the URL instead of a
// session-length JWT, keeping that exposure to 30 seconds and one use.

const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const { verifyToken } = require("./token")
const { isRedisEnabled, getPublisher } = require("../config/redis")

const TICKET_TTL_SECONDS = 30
const TICKET_TYPE = "sse"

// Replay ledger, bounded by ticket lifetime rather than by traffic.
const consumed = new Map()

function sweepConsumed() {
  const now = Date.now()
  for (const [jti, expiresAt] of consumed) {
    if (expiresAt <= now) consumed.delete(jti)
  }
}

// The caller must have authenticated the user already.
function issueTicket(userId) {
  const jti = crypto.randomBytes(16).toString("hex")
  const token = jwt.sign(
    { id: String(userId), jti, typ: TICKET_TYPE },
    process.env.JWT_SECRET,
    { expiresIn: TICKET_TTL_SECONDS }
  )
  return { ticket: token, expiresIn: TICKET_TTL_SECONDS }
}

// Returns the user id, or null when the ticket is invalid, expired, of the
// wrong type, or already used.
async function consumeTicket(ticket) {
  if (!ticket) return null
  let payload
  try {
    payload = verifyToken(ticket)
  } catch {
    return null
  }

  // A session JWT carries no `typ`, so it is refused like any invalid ticket.
  if (payload?.typ !== TICKET_TYPE || !payload.jti || !payload.id) return null

  if (isRedisEnabled()) {
    const redis = getPublisher()
    const acquired = await redis.set(`ticket:${payload.jti}`, "1", { NX: true, EX: TICKET_TTL_SECONDS })
    if (!acquired) return null
  } else {
    sweepConsumed()
    if (consumed.has(payload.jti)) return null

    const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + TICKET_TTL_SECONDS * 1000
    consumed.set(payload.jti, expiresAt)
  }
  
  return payload.id
}

// Diagnostics only; no route exposes it.
const consumedCount = () => consumed.size

module.exports = { issueTicket, consumeTicket, consumedCount, TICKET_TTL_SECONDS }
