// Server-Sent Events hub for notification delivery.
//
// Holds one entry per open connection, keyed by recipient, so a user with
// several tabs receives each event once per tab and nothing is delivered to
// anyone else.
//
// Delivery is two-tier: connections held by this process are written to
// directly, and when Redis is configured the same event is mirrored to the
// other instances over a pub/sub channel. Each broadcast carries the id of the
// process that raised it, so an instance ignores its own event coming back
// rather than delivering it twice. Without Redis the hub is process-local and
// behaves exactly as it did before that tier existed.
//
// This module owns transport only. NotificationService decides what is
// published, exactly as it does for email.

const { isRedisEnabled, getPublisher, getSubscriber } = require("../config/redis")
const { logger } = require("../utils/logger")

const HEARTBEAT_MS = 25000
const CHANNEL = "civiq:notifications"
// Guards against one client exhausting the process by opening tabs endlessly.
const MAX_CONNECTIONS_PER_USER = 8
// Identifies events this process originated, so a Redis round trip does not
// deliver them to local clients a second time.
const INSTANCE_ID = `${process.pid}-${Date.now().toString(36)}`

/**
 * recipientId -> Set of { res, cleanup } entries.
 *
 * The teardown function is stored alongside the socket so shutdown can release
 * a connection through the same path a client disconnect uses. Ending the
 * response alone would leave its heartbeat timer running and hold the event
 * loop open.
 */
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
    // A socket that has gone away mid-write is dropped by the close handler.
    return false
  }
}

/**
 * Registers an SSE connection for a recipient and returns a teardown function.
 * The caller is responsible for having authenticated the request first.
 */
function addConnection(recipientId, req, res) {
  const key = String(recipientId)

  // Oldest-first eviction: a user opening more tabs keeps the newest ones
  // rather than being refused a connection outright.
  const existing = connections.get(key)
  if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = existing.values().next().value
    oldest?.cleanup()
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    // no-transform stops the global compression middleware from buffering the
    // stream; without it nothing reaches the client until the response ends.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Defeats proxy-level response buffering (nginx and friends).
    "X-Accel-Buffering": "no",
  })
  res.flushHeaders?.()

  // Tells the browser how long to wait before reconnecting on its own.
  res.write("retry: 5000\n\n")
  res.write(": connected\n\n")

  // Comment frames keep intermediaries from reaping an idle connection and
  // surface sockets that died without a close event. Unref'd so a stray timer
  // can never be the reason the process stays alive.
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

/** Writes an event to the connections held by *this* process only. */
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

/**
 * Publishes an event to the recipient wherever they are connected.
 *
 * Local clients are always written to directly, so behaviour is unchanged
 * without Redis. When Redis is available the same event is mirrored to the
 * other instances, tagged with this process id so it is not delivered twice to
 * the clients already served here.
 */
function publish(recipientId, event, payload, id) {
  if (!recipientId) return 0
  const delivered = deliverLocally(recipientId, event, payload, id)

  if (isRedisEnabled()) {
    const message = JSON.stringify({ origin: INSTANCE_ID, recipientId: String(recipientId), event, payload, id })
    // Fire-and-forget: a Redis hiccup must not fail the local delivery that
    // has already succeeded.
    getPublisher().publish(CHANNEL, message).catch((err) => {
      logger.error("Redis publish failed", { error: err.message })
    })
  }

  return delivered
}

/**
 * Subscribes this instance to events raised elsewhere. Safe to call when Redis
 * is disabled — it simply does nothing and the hub stays local-only.
 */
async function subscribeToRedis() {
  if (!isRedisEnabled()) return false
  await getSubscriber().subscribe(CHANNEL, (raw) => {
    try {
      const { origin, recipientId, event, payload, id } = JSON.parse(raw)
      // Our own broadcast coming back: local clients already have it.
      if (origin === INSTANCE_ID) return
      deliverLocally(recipientId, event, payload, id)
    } catch (err) {
      logger.error("Redis notification message dropped", { error: err.message })
    }
  })
  return true
}

/** Diagnostics only — no route exposes these. */
function stats() {
  let total = 0
  for (const set of connections.values()) total += set.size
  return { recipients: connections.size, connections: total }
}

/**
 * Releases every connection on graceful shutdown, through each connection's own
 * teardown so heartbeat timers are cleared and nothing keeps the event loop
 * alive while server.close() waits.
 */
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
