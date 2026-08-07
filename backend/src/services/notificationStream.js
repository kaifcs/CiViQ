// Server-Sent Events hub, keyed by recipient. Transport only: NotificationService
// decides what is published. Delivery is two-tier — local connections directly,
// and mirrored over Redis to other instances when it is configured.

const { isRedisEnabled, getPublisher, getSubscriber } = require("../config/redis")
const { logger } = require("../utils/logger")

const HEARTBEAT_MS = 25000
const CHANNEL = "civiq:notifications"
// Guards against one client exhausting the process by opening tabs endlessly.
const MAX_CONNECTIONS_PER_USER = 8
// Tags this process's own broadcasts, so a Redis round trip does not deliver
// them to local clients a second time.
const INSTANCE_ID = `${process.pid}-${Date.now().toString(36)}`

// recipientId -> Set of { res, cleanup }. The teardown is stored alongside the
// socket so shutdown releases a connection through the same path a disconnect
// does; ending the response alone would leave its heartbeat timer running.
const connections = new Map()

function serialise(event, payload, id) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(payload)}`)
  lines.push("", "")
  return lines.join("\n")
}

function write(res, chunk) {
  try {
    res.write(chunk)
    return true
  } catch {
    // A socket that went away mid-write is dropped by the close handler.
    return false
  }
}

// The caller is responsible for having authenticated the request first.
function addConnection(recipientId, req, res) {
  const key = String(recipientId)

  // Oldest-first eviction, so opening another tab is never refused outright.
  const existing = connections.get(key)
  if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = existing.values().next().value
    oldest?.cleanup()
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    // no-transform stops the compression middleware buffering the stream.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Defeats proxy-level response buffering (nginx and friends).
    "X-Accel-Buffering": "no",
  })
  res.flushHeaders?.()

  res.write("retry: 5000\n\n")
  res.write(": connected\n\n")

  // Keeps intermediaries from reaping an idle connection, and surfaces sockets
  // that died without a close event. Unref'd so it cannot hold the process open.
  const heartbeat = setInterval(() => {
    if (!write(res, ": ping\n\n")) cleanup()
  }, HEARTBEAT_MS)
  heartbeat.unref?.()

  const entry = { res, cleanup: () => cleanup() }
  if (!connections.has(key)) connections.set(key, new Set())
  connections.get(key).add(entry)

  let closed = false
  function cleanup() {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    const set = connections.get(key)
    if (set) {
      set.delete(entry)
      if (set.size === 0) connections.delete(key)
    }
    try { res.end() } catch { /* already destroyed */ }
  }

  req.on("close", cleanup)
  req.on("error", cleanup)
  res.on("error", cleanup)

  return cleanup
}

// Writes to the connections held by this process only.
function deliverLocally(recipientId, event, payload, id) {
  if (!recipientId) return 0
  const set = connections.get(String(recipientId))
  if (!set || set.size === 0) return 0

  const frame = serialise(event, payload, id)
  let delivered = 0
  for (const entry of set) {
    if (write(entry.res, frame)) delivered += 1
  }
  return delivered
}

// Local clients are always written to directly, so the hub works without Redis.
function publish(recipientId, event, payload, id) {
  if (!recipientId) return 0
  const delivered = deliverLocally(recipientId, event, payload, id)

  if (isRedisEnabled()) {
    const message = JSON.stringify({ origin: INSTANCE_ID, recipientId: String(recipientId), event, payload, id })
    // Fire-and-forget: a Redis hiccup must not fail delivery that succeeded.
    getPublisher().publish(CHANNEL, message).catch((err) => {
      logger.error("Redis publish failed", { error: err.message })
    })
  }

  return delivered
}

// Safe to call when Redis is disabled; the hub then stays local-only.
async function subscribeToRedis() {
  if (!isRedisEnabled()) return false
  await getSubscriber().subscribe(CHANNEL, (raw) => {
    try {
      const { origin, recipientId, event, payload, id } = JSON.parse(raw)
      // Our own broadcast coming back; local clients already have it.
      if (origin === INSTANCE_ID) return
      deliverLocally(recipientId, event, payload, id)
    } catch (err) {
      logger.error("Redis notification message dropped", { error: err.message })
    }
  })
  return true
}

// Diagnostics only.
function stats() {
  let total = 0
  for (const set of connections.values()) total += set.size
  return { recipients: connections.size, connections: total }
}

// Releases every connection through its own teardown, so no heartbeat timer
// keeps the event loop alive while server.close() waits.
function closeAll() {
  for (const set of [...connections.values()]) {
    for (const entry of [...set]) entry.cleanup()
  }
  connections.clear()
}

module.exports = {
  addConnection, publish, subscribeToRedis, stats, closeAll,
  HEARTBEAT_MS, MAX_CONNECTIONS_PER_USER,
}
