// User management routes — administrator only.
//
// Accounts are created through the admin-only POST /api/auth/register endpoint.
// Accounts are deactivated via /:id/status instead of deleted to preserve
// project, complaint and audit history.
//
// The first administrator is provisioned outside the API (seed or database),
// avoiding any public bootstrap path.

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
