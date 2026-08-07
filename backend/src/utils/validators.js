// Input validation for the auth routes. Each validator returns a message for
// the first problem found, or null, so callers branch on one truthy check.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Administrators must be promoted separately, so no single request both creates
// a principal and grants it unrestricted access.
const CREATABLE_ROLES = ["officer", "supervisor"]

function validateRegisterInput({ fullName, email, password, role }) {
  if (!fullName || !fullName.trim()) return "Full name is required"
  if (!email || !EMAIL_REGEX.test(email)) return "A valid email address is required"
  if (!password || password.length < 8) return "Password must be at least 8 characters long"
  if (!role || !CREATABLE_ROLES.includes(role)) {
    return `Role must be one of: ${CREATABLE_ROLES.join(", ")}`
  }
  return null
}

// Presence only. A format rule here would tell an attacker which half of the
// credentials was wrong, so both failures converge on one message.
function validateLoginInput({ email, password }) {
  if (!email || !password) return "Email and password are required"
  return null
}

module.exports = { validateRegisterInput, validateLoginInput, EMAIL_REGEX, CREATABLE_ROLES }
