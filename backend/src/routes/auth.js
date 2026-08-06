// Authentication routes.
//
// login is public.
//
// register is admin-only. Staff accounts must be created by an administrator;
// self-registration would allow unauthenticated users to obtain staff
// privileges and access protected complaint data.

const router = require("express").Router()
const { register, login, logout, getMe } = require("../controllers/authController")
const { protect, authorize } = require("../middleware/auth")

router.post("/register", protect, authorize("admin"), register)
router.post("/login", login)
router.post("/logout", protect, logout)
router.get("/me", protect, getMe)

module.exports = router
