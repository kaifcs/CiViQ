const router = require("express").Router()
const c = require("../controllers/complaintsController")
const { protect, authorize, optionalAuth } = require("../middleware/auth")

router.get("/",        optionalAuth, c.getComplaints)

// Registered before "/:id" so it can never be captured as one. That route
// accepts a CNR as well as an ObjectId, so "stats" would otherwise be looked up
// as a tracking reference and answered with 404.
router.get("/stats",   c.getComplaintStats)

router.get("/:id",     optionalAuth, c.getComplaint)
router.post("/",       c.createComplaint)

// PUT writes `status` and `resolutionNote` among other fields, so it is held to
// the same roles as the narrower PATCH /:id/status below. It previously required
// only authentication, making the broader endpoint the weaker one.
router.put("/:id",     protect, authorize("admin", "officer", "supervisor"), c.updateComplaint)

router.patch("/:id/status", protect, authorize("admin", "officer", "supervisor"), c.updateStatus)
router.patch("/:id/assign", protect, authorize("admin", "officer"), c.assignComplaint)

module.exports = router
