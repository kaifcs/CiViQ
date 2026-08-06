const router = require("express").Router()
const c = require("../controllers/notificationsController")
const { protect } = require("../middleware/auth")
const { consumeTicket } = require("../utils/streamTicket")
const { generateToken } = require("../utils/token")
const { unauthorized } = require("../utils/apiResponse")

/**
 * EventSource cannot set an Authorization header, so the stream is opened with
 * a short-lived single-use ticket obtained from POST /stream-ticket. The ticket
 * is exchanged for a Bearer header here and validated by the unmodified
 * `protect` middleware, so account state and RBAC are still enforced by the one
 * authentication pipeline. Session JWTs are rejected: they carry no ticket type.
 */
async function streamAuth(req, res, next) {
  const userId = await consumeTicket(req.query.ticket)
  if (!userId) {
    // Routed through the shared helper so this failure carries the same
    // { success, error: { code, message }, message } envelope as every other
    // 401. It was the one rejection in the API emitting a bare body, so a
    // client branching on error.code got undefined for the failure the stream's
    // reconnect loop meets most often.
    return unauthorized(res, "Invalid or expired stream ticket")
  }
  req.headers.authorization = `Bearer ${generateToken(userId)}`
  return protect(req, res, next)
}

// Registered before the blanket `protect` so it can supply its own credential
// source; authentication is still mandatory and still performed by `protect`.
router.get("/stream", streamAuth, c.streamNotifications)

router.use(protect)

router.post("/stream-ticket", c.issueStreamTicket)

router.get("/", c.getNotifications)

// Static paths registered before "/:id" so they can never be captured as ids.
router.get("/unread-count", c.getUnreadCount)
router.patch("/read-all", c.markRead)
// Original route kept so existing clients calling PUT continue to work.
router.put("/read-all", c.markRead)

router.route("/preferences")
  .get(c.getPreferences)
  .patch(c.updatePreferences)

// Bulk lifecycle actions. Every one is scoped to the authenticated recipient.
router.patch("/bulk-archive", c.bulkArchive)
router.patch("/bulk-unarchive", c.bulkUnarchive)
router.delete("/bulk-delete", c.bulkDelete)

router.get("/:id", c.getNotification)
router.patch("/:id/read", c.markOneRead)
router.patch("/:id/archive", c.archiveOne)
router.patch("/:id/unarchive", c.unarchiveOne)
router.delete("/:id", c.deleteOne)

module.exports = router
