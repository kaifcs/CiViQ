// User administration — admin only. A role change takes effect immediately,
// because `protect` re-reads the user on every request.

const mongoose = require("mongoose")
const User = require("../models/User")
const Department = require("../models/Department")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { notifyRoleChanged } = require("../services/notificationService")
const { ERROR_CODES, badRequest, fail, notFound } = require("../utils/apiResponse")
const { logger } = require("../utils/logger")
const ALLOWED_ROLES = User.schema.path("role").enumValues

exports.getUsers = async (req, res) => {
  try {
    const page = parsePagination(req.query)
    let q = User.find().select("-password").sort({ createdAt: -1 })
    if (page.enabled) q = q.skip(page.skip).limit(page.limit)

    const users = await q
    if (page.enabled) setPaginationHeaders(res, await User.countDocuments(), page)
    res.status(200).json({ success: true, count: users.length, users })
  } catch (err) {
    logger.error("Error getting users", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error retrieving users")
  }
}

exports.getUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid user ID")
    }

    const user = await User.findById(req.params.id).select("-password")

    if (!user) {
      return notFound(res, "User not found", ERROR_CODES.USER_NOT_FOUND)
    }

    res.status(200).json({ success: true, user })
  } catch (err) {
    logger.error("Error getting user", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error retrieving user")
  }
}

exports.updateUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid user ID")
    }

    const user = await User.findById(req.params.id)
    if (!user) {
      return notFound(res, "User not found", ERROR_CODES.USER_NOT_FOUND)
    }

    const { fullName, phone, avatar, role, department } = req.body
    const updates = {}

    if (fullName !== undefined) updates.fullName = fullName
    if (phone !== undefined) updates.phone = phone
    if (avatar !== undefined) updates.avatar = avatar

    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return badRequest(res, `Role must be one of: ${ALLOWED_ROLES.join(", ")}`)
      }
      updates.role = role
    }

    if (department !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(department)) {
        return badRequest(res, "Invalid department ID")
      }
      const departmentExists = await Department.findById(department)
      if (!departmentExists) {
        return badRequest(res, "Referenced department does not exist")
      }
      if (!departmentExists.isActive) {
        return badRequest(res, "Cannot assign an inactive department")
      }
      updates.department = department
    }

    const previousRole = user.role

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password")

    // Only an actual change notifies, so re-saving the same role is silent.
    if (updates.role !== undefined && updates.role !== previousRole) {
      await notifyRoleChanged(updatedUser._id, updatedUser.role)
    }

    res.status(200).json({ success: true, user: updatedUser })
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((val) => val.message)
      return badRequest(res, messages.join(", "))
    }
    logger.error("Error updating user", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error updating user")
  }
}

exports.updateUserStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid user ID")
    }

    const { isActive } = req.body
    if (typeof isActive !== "boolean") {
      return badRequest(res, "Please provide a valid boolean isActive status")
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    ).select("-password")

    if (!user) {
      return notFound(res, "User not found", ERROR_CODES.USER_NOT_FOUND)
    }

    res.status(200).json({ success: true, user })
  } catch (err) {
    logger.error("Error updating user status", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error updating user status")
  }
}
