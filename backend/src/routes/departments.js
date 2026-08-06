const express = require("express")
const router = express.Router()

const {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  updateDepartmentStatus,
} = require("../controllers/departmentController")

const { protect, authorize } = require("../middleware/auth")

// Every department route requires authentication. Writes stay admin-only;
// reads are open to any authenticated role because departments are referenced
// by id on complaints and users, and non-admins cannot otherwise resolve those
// ids to the codes the UI displays. Nothing here is sensitive — the same
// name/code already reaches every role via populated project references.
router.use(protect)

router.route("/")
  .get(getDepartments)
  .post(authorize("admin"), createDepartment)

router.route("/:id")
  .get(getDepartment)
  .put(authorize("admin"), updateDepartment)

router.route("/:id/status")
  .patch(authorize("admin"), updateDepartmentStatus)

module.exports = router
