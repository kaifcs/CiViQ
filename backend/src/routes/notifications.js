const router = require("express").Router()
const c = require("../controllers/notificationsController")
const { protect } = require("../middleware/auth")
const { consumeTicket } = require("../utils/streamTicket")
const { generateToken } = require("../utils/token")
const { unauthorized } = require("../utils/apiResponse")

// EventSource cannot set an Authorization header, so the stream is opened with a
// single-use ticket that is exchanged for a Bearer header here — account state
// and RBAC stay enforced by the one `protect` pipeline. Session JWTs are refused.
async function streamAuth(req, res, next) {
  const userId = await consumeTicket(req.query.ticket)
  if (!userId) {
    return unauthorized(res, "Invalid or expired stream ticket")
  }
  req.headers.authorization = `Bearer ${generateToken(userId)}`
  return protect(req, res, next)
}

// Before the blanket `protect` so it can supply its own credential source.
router.get("/stream", streamAuth, c.streamNotifications)

router.use(protect)

router.post("/stream-ticket", c.issueStreamTicket)

router.get("/", c.getNotifications)

// Static paths registered before "/:id" so they can never be captured as ids.
router.get("/unread-count", c.getUnreadCount)
router.patch("/read-all", c.markRead)
// Legacy alias, kept for existing clients.
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
