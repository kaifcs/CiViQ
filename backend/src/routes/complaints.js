const router = require("express").Router()
const c = require("../controllers/complaintsController")
const { protect, authorize, optionalAuth } = require("../middleware/auth")

router.get("/", optionalAuth, c.getComplaints)

// Keep stats before /:id so "stats" is not treated as a CNR.
router.get("/stats", c.getComplaintStats)

router.get("/:id", optionalAuth, c.getComplaint)
router.post("/", c.createComplaint)

// Assignment fields use the same roles as the dedicated assignment route.
router.put("/:id", protect, authorize("admin", "officer", "supervisor"), c.updateComplaint)

router.patch("/:id/status", protect, authorize("admin", "officer", "supervisor"), c.updateStatus)
router.patch("/:id/assign", protect, authorize(...c.ASSIGNMENT_ROLES), c.assignComplaint)

module.exports = router