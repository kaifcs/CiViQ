// Authentication routes. Login is public; register is admin-only, because
// self-registration would let anyone grant themselves staff privileges and the
// access to complaint data that comes with them.

const router = require("express").Router()
const { register, login, logout, getMe } = require("../controllers/authController")
const { protect, authorize } = require("../middleware/auth")

router.post("/register", protect, authorize("admin"), register)
router.post("/login", login)
router.post("/logout", protect, logout)
router.get("/me", protect, getMe)

module.exports = router
