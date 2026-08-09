// Input validation for the auth routes. Each validator returns a message for
// the first problem found, or null, so callers branch on one truthy check.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Administrators must be promoted separately, so no single request both creates
// a principal and grants it unrestricted access.
const CREATABLE_ROLES = ["officer", "supervisor"]

// Credential fields must be strings; otherwise string methods or bcrypt can throw.
const isString = (value) => typeof value === "string"

function validateRegisterInput({ fullName, email, password, role }) {
  if (!isString(fullName) || !fullName.trim()) return "Full name is required"
  if (!isString(email) || !EMAIL_REGEX.test(email)) return "A valid email address is required"
  if (!isString(password) || password.length < 8) return "Password must be at least 8 characters long"
  if (!role || !CREATABLE_ROLES.includes(role)) {
    return `Role must be one of: ${CREATABLE_ROLES.join(", ")}`
  }
  return null
}

// Presence and type only; all failures use the same message.
function validateLoginInput({ email, password }) {
  if (!isString(email) || !isString(password) || !email || !password) {
    return "Email and password are required"
  }
  return null
}

module.exports = { validateRegisterInput, validateLoginInput, EMAIL_REGEX, CREATABLE_ROLES, isString }
