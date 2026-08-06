// Authentication endpoints.
//
// Login returns the same error for an unknown email or wrong password to avoid
// account enumeration. Registration is admin-only, so duplicate email errors
// are safe. Logout records the event; JWT sessions remain stateless.

const User = require("../models/User")
const { generateToken } = require("../utils/token")
const { validateRegisterInput, validateLoginInput } = require("../utils/validators")
const { ERROR_CODES, badRequest, conflictError, fail, unauthorized } = require("../utils/apiResponse")
const { logger } = require("../utils/logger")

// POST /api/auth/register — administrator only (see routes/auth.js).
// Creates a staff account. `role` is constrained to CREATABLE_ROLES, so this
// cannot mint another administrator in one step.
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

// GET /api/auth/me
exports.getMe = async (req, res) => {
  return res.status(200).json({ success: true, user: req.user })
}
