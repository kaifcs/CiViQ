// Analytics routes — administrator only, read-only.
// Every endpoint reports municipality-wide rather than per caller scope, so the
// role gate covers the whole router; there is no per-record filtering to fall back on.

const router = require("express").Router()
const c = require("../controllers/dashboardController")
const { protect, authorize } = require("../middleware/auth")

router.use(protect, authorize("admin"))

router.get("/summary", c.getSummary)
router.get("/projects", c.getProjects)
router.get("/conflicts", c.getConflicts)
router.get("/complaints", c.getComplaints)
router.get("/departments", c.getDepartments)
router.get("/activity", c.getActivity)

module.exports = router
