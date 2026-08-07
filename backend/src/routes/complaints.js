const router = require("express").Router()
const c = require("../controllers/complaintsController")
const { protect, authorize, optionalAuth } = require("../middleware/auth")

router.get("/",        optionalAuth, c.getComplaints)

// Registered before "/:id", which accepts a CNR — "stats" would otherwise be
// looked up as a tracking reference.
router.get("/stats",   c.getComplaintStats)

router.get("/:id",     optionalAuth, c.getComplaint)
router.post("/",       c.createComplaint)

// PUT writes `status` and `resolutionNote`, so it carries the same roles as the
// narrower PATCH /:id/status below.
router.put("/:id",     protect, authorize("admin", "officer", "supervisor"), c.updateComplaint)

router.patch("/:id/status", protect, authorize("admin", "officer", "supervisor"), c.updateStatus)
router.patch("/:id/assign", protect, authorize("admin", "officer"), c.assignComplaint)

module.exports = router
