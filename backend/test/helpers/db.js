// Database access for integration tests. They connect to an isolated database
// that is dropped afterwards, never the developer's configured one, and skip
// with a stated reason when no MongoDB is reachable.

const path = require("node:path")
const mongoose = require("mongoose")

// Deliberately not MONGODB_URI: pointing tests there would drop it.
const BASE_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/civiq_test_s5"

// One database per test file. The runner executes files concurrently, so a
// shared database would let one file's teardown delete another's fixtures.
// Deriving the name from the entry file makes the isolation automatic.
const suffix = path.basename(process.argv[1] || "shared", ".test.js").replace(/[^\w]/g, "_")
const [prefix, base] = [BASE_URI.slice(0, BASE_URI.lastIndexOf("/")), BASE_URI.split("/").pop()]
const DB_NAME = `${base.split("?")[0]}_${suffix}`
const TEST_URI = `${prefix}/${DB_NAME}`

let available = null

// Memoised, so each file pays the connection cost once.
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
    try { await mongoose.disconnect() } catch { /* never connected */ }
  }
  return available
}

// Stated on every skip, so a skipped suite is never silent.
const SKIP_REASON = `no MongoDB at ${TEST_URI} — integration tests skipped`

async function dropAndDisconnect() {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === DB_NAME) {
    // An index build still in flight would recreate the database immediately
    // after the drop, leaving it behind on the server.
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init().catch(() => {}))
    )
    await mongoose.connection.dropDatabase()
  }
  await mongoose.disconnect()
  available = null
}

// Empties every collection between tests, so no test depends on another.
async function clearCollections() {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
}

module.exports = { mongoAvailable, dropAndDisconnect, clearCollections, TEST_URI, DB_NAME, SKIP_REASON }
