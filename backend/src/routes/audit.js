// Audit trail routes — administrator only.
// Read-only: entries are written solely by services/auditService, from inside
// the business operation they describe.

const router = require("express").Router()
const { getLogs, getLog } = require("../controllers/auditController")
const { protect, authorize } = require("../middleware/auth")

router.use(protect, authorize("admin"))
router.get("/", getLogs)
router.get("/:id", getLog)

module.exports = router
