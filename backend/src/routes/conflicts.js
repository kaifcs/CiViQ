// Conflict routes. Reads are open to any authenticated user, but the payload is
// filtered per viewer by utils/serializers, so the list cannot be used to read
// project detail across the ownership boundary.

const router = require("express").Router()
const c = require("../controllers/conflictsController")
const { protect, authorize } = require("../middleware/auth")
router.use(protect)
router.get("/",                c.getConflicts)
router.get("/:id",             c.getConflict)
// Conflict ownership is checked in the controller: it depends on which of the
// two projects the caller owns.
router.put("/:id/resolve",     authorize("admin"),   c.resolveConflict)
router.put("/:id/respond",     authorize("officer"), c.officerRespond)
module.exports = router
