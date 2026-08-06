// JWT signing and verification.
//
// The one place that touches JWT_SECRET. Stream tickets (utils/streamTicket)
// verify through this module rather than reading the secret themselves, so
// there is a single signing key and a single verification path.

const jwt = require("jsonwebtoken")

/** Signs a session token. The payload carries only the user id — never a role,
 *  which would let a stale token outlive a role change. */
function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  })
}

/** Verifies a token, throwing on an invalid or expired one. Callers distinguish
 *  the two by err.name === "TokenExpiredError". */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET)
}

module.exports = { generateToken, verifyToken }
