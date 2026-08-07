// Retry sweep for transient email failures. The queue is the Notification
// collection itself, so no broker is involved. Safe on several instances at
// once: each row is claimed atomically before it is sent.

const service = require("./notificationService")
const { isEnabled: emailEnabled } = require("./emailService")
const { logger } = require("../utils/logger")

const SWEEP_INTERVAL_MS = 60_000
const BATCH_SIZE = 25

let timer = null
let running = false
let inFlight = null

async function sweep() {
  // Overlapping sweeps would only contend for the same claims.
  if (running || !emailEnabled()) return { processed: 0 }
  running = true
  let processed = 0
  try {
    const due = await service.dueForRetry(BATCH_SIZE)
    for (const { _id } of due) {
      await service.retryEmail(_id)
      processed += 1
    }
  } catch (err) {
    logger.error("Email retry sweep failed", { error: err.message })
  } finally {
    running = false
  }
  return { processed }
}

function start() {
  if (timer) return
  timer = setInterval(() => { inFlight = sweep() }, SWEEP_INTERVAL_MS)
  // Unref'd so the sweep can never be the reason the process stays alive.
  timer.unref?.()
}

// Waits for any pass already running, so a send in progress is recorded.
async function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  try { await inFlight } catch { /* already logged */ }
  inFlight = null
}

module.exports = { start, stop, sweep, SWEEP_INTERVAL_MS, BATCH_SIZE }
