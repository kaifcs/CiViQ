// Process lifecycle: environment validation, connections, listening, shutdown.
//
// The request pipeline itself lives in src/app.js. Splitting the two lets the
// assembled app be exercised without starting a listener or touching the
// configured database; nothing about the pipeline changed in the move.

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

    // Both are optional: without Redis the stream stays process-local, and
    // without Brevo credentials the retry sweep has nothing to do.
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

  // Let an in-flight retry sweep finish so a send in progress is recorded
  // rather than abandoned mid-flight.
  await emailRetryWorker.stop()

  // Open notification streams are long-lived by design; server.close() waits
  // for every connection to end, so they have to be released first or shutdown
  // never completes.
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
