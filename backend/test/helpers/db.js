// MongoDB helper for integration tests.
const path = require("node:path")
const mongoose = require("mongoose")

// Never use the application's MongoDB URI.
const BASE_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/civiq_test_s5"

// Isolate each test file in its own database.
const suffix = path
  .basename(process.argv[1] || "shared", ".test.js")
  .replace(/[^\w]/g, "_")

const [prefix, base] = [
  BASE_URI.slice(0, BASE_URI.lastIndexOf("/")),
  BASE_URI.split("/").pop(),
]

const DB_NAME = `${base.split("?")[0]}_${suffix}`
const TEST_URI = `${prefix}/${DB_NAME}`

let available = null

// Check MongoDB availability once per file.
async function mongoAvailable() {
  if (available !== null) return available

  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 1500 })

    if (mongoose.connection.name !== DB_NAME) {
      throw new Error(`refusing to run against "${mongoose.connection.name}"`)
    }

    available = true
  } catch {
    available = false
    try {
      await mongoose.disconnect()
    } catch { /* ignore */ }
  }

  return available
}

const SKIP_REASON = `no MongoDB at ${TEST_URI} — integration tests skipped`

// Drop the test database and close the connection.
async function dropAndDisconnect() {
  if (
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === DB_NAME
  ) {
    await Promise.all(
      Object.values(mongoose.models).map((model) =>
        model.init().catch(() => {})
      )
    )

    await mongoose.connection.dropDatabase()
  }

  await mongoose.disconnect()
  available = null
}

// Clear collections between tests.
async function clearCollections() {
  const { collections } = mongoose.connection

  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  )
}

module.exports = {
  mongoAvailable,
  dropAndDisconnect,
  clearCollections,
  TEST_URI,
  DB_NAME,
  SKIP_REASON,
}