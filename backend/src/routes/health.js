// Liveness and subsystem diagnostics.
//
// The one unauthenticated route in the API, so it reports state without ever
// revealing configuration: subsystems are "connected", "configured" or
// "disabled", never a host, URI or credential.

const router = require("express").Router()
const mongoose = require("mongoose")
const asyncHandler = require("../utils/asyncHandler")
const { isRedisEnabled } = require("../config/redis")
const { isEnabled: emailEnabled } = require("../services/emailService")
const notificationStream = require("../services/notificationStream")

const CONNECTION_STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const dbState = CONNECTION_STATES[mongoose.connection.readyState] || "unknown"
    const streamStats = notificationStream.stats()

    // Optional infrastructure reports "disabled", never "down": running
    // without Redis or Brevo is a supported configuration, and a probe must
    // not treat it as a fault. The top-level fields are the stable contract;
    // `subsystems` carries the detail.
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      database: dbState,

      subsystems: {
        mongodb: dbState,
        redis: isRedisEnabled() ? "connected" : "disabled",
        email: emailEnabled() ? "configured" : "disabled",
        notificationStream: {
          status: "ready",
          recipients: streamStats.recipients,
          connections: streamStats.connections,
        },
      },
    })
  })
)

module.exports = router
