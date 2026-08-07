const router = require("express").Router()
const c = require("../controllers/projectsController")
const { protect, authorize } = require("../middleware/auth")
const { requireProjectAccess } = require("../middleware/ownership")
router.use(protect)

// Single-project routes carry `requireProjectAccess` for officer/supervisor
// scoping. Admin-only routes need none: an admin is unrestricted by that rule.
router.get("/",           c.getProjects)
router.get("/:id",        requireProjectAccess, c.getProject)
router.post("/",          authorize("officer", "admin"), c.createProject)
router.put("/:id",        authorize("admin", "officer", "supervisor"), requireProjectAccess, c.updateProject)
router.put("/:id/approve",authorize("admin"),   c.approveProject)
router.put("/:id/reject", authorize("admin"),   c.rejectProject)
router.put("/:id/progress",authorize("supervisor"), requireProjectAccess, c.updateProgress)
router.patch("/:id/status", authorize("admin"), c.updateProjectStatus)
module.exports = router
