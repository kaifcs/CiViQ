// Database access for integration tests.
//
// Integration tests need a real MongoDB because the behaviours they protect —
// index-driven query plans, atomic claims, scoped filters — cannot be observed
// against a stub. They connect to an isolated database that is dropped
// afterwards, never to the developer's configured one.
//
// When no MongoDB is reachable the suite skips those tests rather than failing,
// so `npm test` stays useful on a machine without one while CI, which provides
// a MongoDB service, runs the full set.

const path = require("node:path")
const mongoose = require("mongoose")

// Deliberately not read from MONGODB_URI: pointing tests at the configured
// database would drop it.
const BASE_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/civiq_test_s5"

// One database per test FILE.
//
// The runner executes files concurrently, each in its own process, so a shared
// database means one file's teardown deletes another file's fixtures — which
// showed up as an intermittent login failure in the API suite rather than as an
// obvious clash. Deriving the name from the entry file makes isolation
// automatic: a new test file cannot forget to opt in.
const suffix = path.basename(process.argv[1] || "shared", ".test.js").replace(/[^\w]/g, "_")
const [prefix, base] = [BASE_URI.slice(0, BASE_URI.lastIndexOf("/")), BASE_URI.split("/").pop()]
const DB_NAME = `${base.split("?")[0]}_${suffix}`
const TEST_URI = `${prefix}/${DB_NAME}`

let available = null

/** True when a MongoDB is reachable; memoised so each file pays the cost once. */
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

/** Reason string for skipped suites, so a skip is never silent. */
const SKIP_REASON = `no MongoDB at ${TEST_URI} — integration tests skipped`

async function dropAndDisconnect() {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === DB_NAME) {
    // Mongoose builds declared indexes in the background on first model use.
    // Dropping while one is still in flight lets the build recreate the
    // database immediately afterwards, leaving it behind on the server. Waiting
    // for them to settle first is what makes cleanup reliable.
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init().catch(() => {}))
    )
    await mongoose.connection.dropDatabase()
  }
  await mongoose.disconnect()
  available = null
}

/** Empties every collection between tests so no test depends on another. */
async function clearCollections() {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
}

module.exports = { mongoAvailable, dropAndDisconnect, clearCollections, TEST_URI, DB_NAME, SKIP_REASON }
