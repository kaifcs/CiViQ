// Authentication endpoints. Login returns one error for an unknown email, a
// wrong password and an inactive account, so it cannot be used to enumerate
// accounts. Registration is admin-only, so a duplicate email error is safe.

const User = require("../models/User")
const { generateToken } = require("../utils/token")
const { validateRegisterInput, validateLoginInput, isString } = require("../utils/validators")
const { pickWritable } = require("../utils/writableFields")
const { recordAudit } = require("../services/auditService")
const { ERROR_CODES, badRequest, conflictError, fail, unauthorized } = require("../utils/apiResponse")
const { logger } = require("../utils/logger")

// What a signed-in user may change about their own account. Deliberately
// narrower than usersController's admin whitelist: role, department and
// isActive are absent, so self-service can never touch them.
const PROFILE_WRITABLE_FIELDS = ["fullName", "phone", "avatar"]

// `role` is constrained to CREATABLE_ROLES, so this cannot mint an administrator.
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role, phone } = req.body

    const validationError = validateRegisterInput({ fullName, email, password, role })
    if (validationError) {
      return badRequest(res, validationError)
    }

    const normalizedEmail = email?.toLowerCase().trim()
    const existingUser = await User.findOne({ email: normalizedEmail })
    if (existingUser) {
      return conflictError(res, "An account with this email already exists", ERROR_CODES.DUPLICATE_RESOURCE)
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      role,
      phone,
    })

    // Account creation grants access, so it is audited like later account changes.
    // Record only the role; targetId identifies the account, and passwords never enter the audit trail.
    await recordAudit({
      req,
      action: "user_created",
      targetType: "User",
      targetId: user._id,
      details: { role: user.role },
    })

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user,
    })
  } catch (err) {
    if (err.code === 11000) {
      return conflictError(res, "An account with this email already exists", ERROR_CODES.DUPLICATE_RESOURCE)
    }
    if (err.name === "ValidationError") {
      const firstError = Object.values(err.errors)[0]?.message || "Invalid input"
      return badRequest(res, firstError)
    }
    logger.error("Register error", { error: err.message })
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Something went wrong while creating the account")
  }
}

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    const validationError = validateLoginInput({ email, password })
    if (validationError) {
      return badRequest(res, validationError)
    }

    const normalizedEmail = email?.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail, isActive: true }).select("+password")

    if (!user || !(await user.matchPassword(password))) {
      return unauthorized(res, "Invalid email or password")
    }

    user.lastLogin = new Date()
    await user.save({ validateBeforeSave: false })

    const token = generateToken(user._id)

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user,
    })
  } catch (err) {
    logger.error("Login error", { error: err.message })
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Something went wrong during login")
  }
}

// POST /api/auth/logout
exports.logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully. Discard the access token on the client.",
  })
}

// Self-service profile update; only the caller's own record is reachable.
exports.updateProfile = async (req, res) => {
  try {
    const updates = pickWritable(req.body, PROFILE_WRITABLE_FIELDS)

    // Writable fields are strings, so reject non-strings before trim or Mongoose casting.
    for (const field of PROFILE_WRITABLE_FIELDS) {
      if (updates[field] !== undefined && !isString(updates[field])) {
        return badRequest(res, `${field} must be a string`)
      }
    }

    if (updates.fullName !== undefined && !updates.fullName.trim()) {
      return badRequest(res, "Full name cannot be empty")
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    })

    await recordAudit({ req, action: "profile_updated", targetType: "User", targetId: user._id })

    return res.status(200).json({ success: true, user })
  } catch (err) {
    if (err.name === "ValidationError") {
      const firstError = Object.values(err.errors)[0]?.message || "Invalid input"
      return badRequest(res, firstError)
    }
    logger.error("Profile update error", { error: err.message })
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Something went wrong while updating your profile")
  }
}

// Self-service password change; no account can change another user's password.
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body

    if (!isString(currentPassword) || !isString(newPassword) || !currentPassword || !newPassword) {
      return badRequest(res, "Current and new password are required")
    }
    if (newPassword.length < 8) {
      return badRequest(res, "New password must be at least 8 characters long")
    }
    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return badRequest(res, "New password and confirmation do not match")
    }

    // req.user excludes password; wrong current password is a validation error, not 401.
    const user = await User.findById(req.user._id).select("+password")
    if (!user || !(await user.matchPassword(currentPassword))) {
      return badRequest(res, "Current password is incorrect")
    }

    user.password = newPassword
    await user.save()

    // JWTs have no revocation state, so the current device stays signed in.
    await recordAudit({ req, action: "password_changed", targetType: "User", targetId: user._id })

    return res.status(200).json({ success: true, message: "Password updated successfully" })
  } catch (err) {
    if (err.name === "ValidationError") {
      const firstError = Object.values(err.errors)[0]?.message || "Invalid input"
      return badRequest(res, firstError)
    }
    logger.error("Password change error", { error: err.message })
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Something went wrong while updating your password")
  }
}

// GET /api/auth/me
exports.getMe = async (req, res) => {
  return res.status(200).json({ success: true, user: req.user })
}
