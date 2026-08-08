// Exposes shared lookup values from the backend configuration.

const router = require("express").Router()
const { protect } = require("../middleware/auth")
const config = require("../config/staticConfig")

router.use(protect)

// Returns available wards.
router.get("/wards", (req, res) => {
  const wards = config.wards || []
  res.status(200).json({ success: true, count: wards.length, wards })
})

module.exports = router