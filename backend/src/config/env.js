// Startup environment check.
//
// Fails fast and loudly rather than letting a missing variable surface later as
// an unsigned token or a connection to nowhere. Only variables without a safe
// default are listed: BREVO_* and REDIS_URL are deliberately absent because
// both subsystems degrade gracefully when unset.
//
// Values are never logged — only the names of what is missing.

const { logger } = require("../utils/logger")

const REQUIRED_VARS = ["PORT", "JWT_SECRET", "JWT_EXPIRES_IN"]

/** Exits the process with a report of what is missing, or returns silently. */
function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key])

  const hasMongoUri = Boolean(process.env.MONGODB_URI)
  if (!hasMongoUri) missing.push("MONGODB_URI")

  if (missing.length > 0) {
    logger.fatal("Missing required environment variable(s)", {
      missing,
      hint: "Check backend/.env against backend/.env.example",
    })
    process.exit(1)
  }
}

module.exports = { validateEnv }
