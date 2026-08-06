// Audit trail routes — administrator only.
//
// Read-only by design: the trail has no create, update or delete endpoint, so
// entries can only be written by services/auditService from inside the business
// operation they describe.

const router = require("express").Router()
const { getLogs, getLog } = require("../controllers/auditController")
const { protect, authorize } = require("../middleware/auth")

router.use(protect, authorize("admin"))
router.get("/", getLogs)
router.get("/:id", getLog)

module.exports = router
