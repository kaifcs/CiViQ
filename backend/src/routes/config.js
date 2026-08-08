// Exposes shared lookup values from backend configuration.

const router = require("express").Router()
const config = require("../config/staticConfig")

// Returns the configured ward register used by public and backend workflows.
router.get("/wards", (req, res) => {
  const wards = config.wards || []
  res.status(200).json({ success: true, count: wards.length, wards })
})

module.exports = router