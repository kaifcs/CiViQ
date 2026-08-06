// MongoDB connection lifecycle.
//
// Connection state is reported through the shared logger rather than the
// driver's own output, so database events carry the same structure and
// redaction as everything else — a URI with embedded credentials is scrubbed
// before it can reach a log line.
//
// Only server.js calls these; nothing else opens or closes a connection.

const mongoose = require("mongoose")
const { logger } = require("../utils/logger")

// Read once at load. Validated by config/env before this module is used.
const MONGODB_URI = process.env.MONGODB_URI

mongoose.connection.on("connected", () => {
  logger.info("✅ MongoDB Connected")
})

mongoose.connection.on("error", (err) => {
  logger.error(`❌ MongoDB Connection Error: ${err.message}`)
})

mongoose.connection.on("disconnected", () => {
  logger.warn("⚠️ MongoDB Disconnected")
})

async function connectDB() {
  await mongoose.connect(MONGODB_URI)
}

/** Closes the connection if one is open. Safe to call during a failed startup. */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close()
  }
}

module.exports = { connectDB, disconnectDB }