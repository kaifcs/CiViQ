// Input validation for the auth routes.
//
// Each validator returns a human-readable message describing the first problem
// found, or null when the input is acceptable — so callers branch on a single
// truthy check and pass the message straight to badRequest().

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Roles allowed during admin-only registration.
// Administrators must be promoted separately via PUT /api/users/:id.
const CREATABLE_ROLES = ["officer", "supervisor"]

/** Validates an account-creation payload. Returns an error message, or null. */
function validateRegisterInput({ fullName, email, password, role }) {
  if (!fullName || !fullName.trim()) return "Full name is required"
  if (!email || !EMAIL_REGEX.test(email)) return "A valid email address is required"
  if (!password || password.length < 8) return "Password must be at least 8 characters long"
  if (!role || !CREATABLE_ROLES.includes(role)) {
    return `Role must be one of: ${CREATABLE_ROLES.join(", ")}`
  }
  return null
}

/**
 * Validates a login payload.
 *
 * Only presence is checked. Format rules are deliberately not applied here: a
 * rejection specific to the email would tell an attacker which half of the
 * credentials was wrong, so both failures converge on one message.
 */
function validateLoginInput({ email, password }) {
  if (!email || !password) return "Email and password are required"
  return null
}

module.exports = { validateRegisterInput, validateLoginInput, EMAIL_REGEX, CREATABLE_ROLES }
