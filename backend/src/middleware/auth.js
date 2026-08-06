// Authentication and authorization middleware.

const User = require("../models/User")
const { verifyToken } = require("../utils/token")
const { forbidden, unauthorized } = require("../utils/apiResponse")

/** Authenticates the request and attaches the current user to req.user. */
exports.protect = async (req, res, next) => {
  let token

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1]
  }

  if (!token) {
    return unauthorized(res, "Not authorized — no token provided")
  }

  try {
    const decoded = verifyToken(token)
    const user = await User.findById(decoded.id).select("-password")

    if (!user) {
      return unauthorized(res, "User no longer exists")
    }

    if (!user.isActive) {
      return forbidden(res, "Account is deactivated")
    }

    req.user = user
    next()
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return unauthorized(res, "Token has expired")
    }
    return unauthorized(res, "Invalid token")
  }
}

/** Restricts access to the specified roles. */
exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return unauthorized(res, "User not authenticated")
  }

  if (!roles.includes(req.user.role)) {
    return forbidden(res, "Not authorized for this role")
  }

  next()
}

/** Authenticates if possible, otherwise continues as a guest. */
exports.optionalAuth = async (req, res, next) => {
  let token

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1]
  }

  if (!token) return next()

  try {
    const decoded = verifyToken(token)
    const user = await User.findById(decoded.id).select("-password")

    if (user && user.isActive) {
      req.user = user
    }
  } catch {
    // Continue as unauthenticated.
  }

  next()
}