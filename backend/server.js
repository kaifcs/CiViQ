// Process lifecycle: environment validation, connections, listening, shutdown.
// The request pipeline lives in src/app.js, so it can be exercised without
// starting a listener or touching the configured database.

const dotenv = require("dotenv")
dotenv.config()

const { validateEnv } = require("./src/config/env")

validateEnv()

const app = require("./src/app")
const { connectDB, disconnectDB } = require("./src/config/db")
const { connectRedis, disconnectRedis } = require("./src/config/redis")
const notificationStream = require("./src/services/notificationStream")
const emailRetryWorker = require("./src/services/emailRetryWorker")
const { logger } = require("./src/utils/logger")

const PORT = process.env.PORT || 5000
let server

async function startServer() {
  try {
    await connectDB()

    // Both optional: no Redis keeps the stream process-local, no Brevo
    // credentials leave the sweep inert.
    await connectRedis()
    await notificationStream.subscribeToRedis()
    emailRetryWorker.start()

    server = app.listen(PORT, () => {
      logger.info("Server started", { port: PORT, environment: process.env.NODE_ENV || "development" })
    })
  } catch (err) {
    logger.fatal("Failed to start server", { error: err.message, stack: err.stack })
    process.exit(1)
  }
}

async function shutdown(signal) {
  logger.info("Shutdown signal received", { signal })

  // Let an in-flight sweep finish so a send in progress is recorded.
  await emailRetryWorker.stop()

  // server.close() waits for every connection to end, and streams are
  // long-lived by design — release them first or shutdown never completes.
  notificationStream.closeAll()

  if (server) {
    server.close(async () => {
      await disconnectRedis()
      await disconnectDB()
      logger.info("Shutdown complete", { closed: ["http", "redis", "mongodb"] })
      process.exit(0)
    })
  } else {
    await disconnectRedis()
    await disconnectDB()
    process.exit(0)
  }
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

startServer()
