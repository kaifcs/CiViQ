// Startup environment check. Only variables without a safe default are listed;
// BREVO_* and REDIS_URL are absent because both subsystems degrade when unset.
// Values are never logged, only the names of what is missing.

const { logger } = require("../utils/logger")

const REQUIRED_VARS = ["PORT", "JWT_SECRET", "JWT_EXPIRES_IN"]

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
