// Retry sweep for transient email failures.
//
// The queue is the Notification collection itself: a row that failed a
// retryable send goes back to `pending` with a `nextAttemptAt`, and this worker
// re-drives it when due. No broker and no second collection are involved,
// which is why BullMQ is not a dependency here.
//
// Safe to run on several instances at once: NotificationService claims each
// row atomically, so only one sweep can ever send a given notification.

const service = require("./notificationService")
const { isEnabled: emailEnabled } = require("./emailService")
const { logger } = require("../utils/logger")

const SWEEP_INTERVAL_MS = 60_000
const BATCH_SIZE = 25

let timer = null
let running = false
// Tracks the sweep in flight so shutdown can wait for it to finish.
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
  // The sweep must never be the reason the process stays alive.
  timer.unref?.()
}

/** Stops the sweep and waits for any pass already running to finish. */
async function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  try { await inFlight } catch { /* already logged */ }
  inFlight = null
}

module.exports = { start, stop, sweep, SWEEP_INTERVAL_MS, BATCH_SIZE }
