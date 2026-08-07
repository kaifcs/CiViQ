// The one place that touches JWT_SECRET; stream tickets verify through here
// too, so there is a single signing key and a single verification path.

const jwt = require("jsonwebtoken")

// The payload carries only the user id, never a role — a role in the token
// would outlive a role change.
function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  })
}

// Throws on an invalid or expired token; callers distinguish the two by
// err.name === "TokenExpiredError".
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET)
}

module.exports = { generateToken, verifyToken }
