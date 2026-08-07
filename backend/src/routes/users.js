// User management routes — administrator only.
// Accounts are deactivated via /:id/status rather than deleted, to preserve the
// project, complaint and audit history that references them.

const express = require("express")
const router = express.Router()

const {
  getUsers,
  getUser,
  updateUser,
  updateUserStatus,
} = require("../controllers/usersController")

const { protect, authorize } = require("../middleware/auth")

router.use(protect)
router.use(authorize("admin"))

router.route("/")
  .get(getUsers)

router.route("/:id")
  .get(getUser)
  .put(updateUser)

router.route("/:id/status")
  .patch(updateUserStatus)

module.exports = router
