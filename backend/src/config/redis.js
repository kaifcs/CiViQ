// Optional Redis connection, used to fan notification events across instances.
// The retry budget is bounded: an unreachable server disables Redis for the
// lifetime of the process rather than reconnecting forever and filling the logs.

const { createClient } = require("redis")
const { logger } = require("../utils/logger")

const DEFAULT_URL = "redis://127.0.0.1:6379"
const CONNECT_TIMEOUT_MS = 2000
const MAX_ATTEMPTS = 2

let publisher = null
let subscriber = null
let enabled = false
let announced = false

function url() {
  return process.env.REDIS_URL || DEFAULT_URL
}

function announceOnce(message) {
  if (announced) return
  announced = true
  logger.info(message)
}

function build() {
  return createClient({
    url: url(),
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Returning an Error stops node-redis retrying.
      reconnectStrategy: (retries) =>
        retries >= MAX_ATTEMPTS ? new Error("redis unavailable") : Math.min(200 * (retries + 1), 1000),
    },
  })
}

// Resolves false when Redis is unreachable; callers fall back to local delivery.
async function connectRedis() {
  if (enabled) return true
  try {
    publisher = build()
    subscriber = publisher.duplicate()
    // node-redis emits unhandled 'error' events on failure without these.
    publisher.on("error", () => {})
    subscriber.on("error", () => {})

    await publisher.connect()
    await subscriber.connect()
    enabled = true
    announceOnce(`✅ Redis connected — notification events fan out across instances`)
    return true
  } catch (err) {
    enabled = false
    await disconnectRedis()
    announceOnce(`ℹ️ Redis unavailable (${err.message}) — notifications stay process-local`)
    return false
  }
}

async function disconnectRedis() {
  for (const client of [publisher, subscriber]) {
    try {
      if (client?.isOpen) await client.quit()
      else client?.destroy?.()
    } catch { /* already closed */ }
  }
  publisher = null
  subscriber = null
  enabled = false
}

const isRedisEnabled = () => enabled && Boolean(publisher?.isOpen)
const getPublisher = () => publisher
const getSubscriber = () => subscriber

module.exports = { connectRedis, disconnectRedis, isRedisEnabled, getPublisher, getSubscriber }
