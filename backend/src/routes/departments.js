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

// Writes are admin-only; reads are open to any authenticated role, because
// departments are referenced by id elsewhere and non-admins would otherwise be
// unable to resolve those ids to the codes the UI displays.
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
