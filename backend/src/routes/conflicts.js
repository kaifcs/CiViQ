// Conflict routes.
//
// Reading is open to any authenticated user, but the payload is filtered per
// viewer: a project the caller cannot access is reduced to a bare id by
// utils/serializers, so the conflict list cannot be used to read project detail
// across the ownership boundary.
//
// The two write paths split the resolution — an administrator decides, and the
// owning officer answers. Ownership of a specific conflict is checked in the
// controller because it depends on which of the two projects the caller owns.

const router = require("express").Router()
const c = require("../controllers/conflictsController")
const { protect, authorize } = require("../middleware/auth")
router.use(protect)
router.get("/",                c.getConflicts)
router.get("/:id",             c.getConflict)
router.put("/:id/resolve",     authorize("admin"),   c.resolveConflict)
router.put("/:id/respond",     authorize("officer"), c.officerRespond)
module.exports = router
