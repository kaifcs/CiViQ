// User administration — admin only. A role change takes effect immediately,
// because `protect` re-reads the user on every request.

const mongoose = require("mongoose")
const User = require("../models/User")
const Department = require("../models/Department")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { recordAudit } = require("../services/auditService")
const { notifyRoleChanged } = require("../services/notificationService")
const { ERROR_CODES, badRequest, fail, notFound } = require("../utils/apiResponse")
const { logger } = require("../utils/logger")
const ALLOWED_ROLES = User.schema.path("role").enumValues
const ADMIN_ROLE = "admin"

// Administrative lockout guards. An administrator who removes their own access,
// or the last remaining one, would leave the deployment with no principal able
// to restore it — there is no self-service path back in. Every guard therefore
// runs before the write, so a rejected request leaves the database untouched
// and produces no successful audit entry.

const isSelf = (req, id) => String(req.user?._id) === String(id)

// Excludes the target, so the answer is "would any administrator survive this
// operation", not "is one present now". `exists` stops at the first match
// rather than counting the whole set, which is all the question needs.
const otherActiveAdminsExist = async (targetId) =>
  (await User.exists({
    role: ADMIN_ROLE,
    isActive: true,
    _id: { $ne: targetId },
  })) !== null

// Returns a message when the operation would remove the final active
// administrator, or null when it is safe. `nextRole` and `nextActive` describe
// the state the request is asking for; an operation that leaves the account an
// active administrator, or that touches an account which is not currently one,
// can never be the cause of a lockout.
async function lastAdminBlocker(user, { nextRole, nextActive }) {
  const wasActiveAdmin = user.role === ADMIN_ROLE && user.isActive
  if (!wasActiveAdmin) return null

  const stillActiveAdmin =
    (nextRole === undefined ? user.role : nextRole) === ADMIN_ROLE &&
    (nextActive === undefined ? user.isActive : nextActive)
  if (stillActiveAdmin) return null

  if (await otherActiveAdminsExist(user._id)) return null
  return "The system must always have at least one active administrator"
}

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
      // Self-demotion is refused even when other administrators remain: an
      // administrator cannot drop their own privileges by accident.
      if (isSelf(req, user._id) && user.role === ADMIN_ROLE && role !== ADMIN_ROLE) {
        return badRequest(res, "You cannot change your own administrator role")
      }
      const blocker = await lastAdminBlocker(user, { nextRole: role })
      if (blocker) return badRequest(res, blocker)
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

    // Recorded after the write so rejected lockout attempts leave no audit entry.
    // Log only changed field names and role transitions; never include credentials.
    await recordAudit({
      req,
      action: "user_updated",
      targetType: "User",
      targetId: updatedUser._id,
      details: {
        fields: Object.keys(updates),
        ...(updates.role !== undefined && updates.role !== previousRole
          ? { role: { from: previousRole, to: updates.role } }
          : {}),
      },
    })

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

    // Read before write: the guards below need the account's current role and
    // status, and a rejected request must not have touched the document.
    const existing = await User.findById(req.params.id)
    if (!existing) {
      return notFound(res, "User not found", ERROR_CODES.USER_NOT_FOUND)
    }

    if (isActive === false) {
      if (isSelf(req, existing._id)) {
        return badRequest(res, "You cannot deactivate your own account")
      }
      const blocker = await lastAdminBlocker(existing, { nextActive: false })
      if (blocker) return badRequest(res, blocker)
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    ).select("-password")

    // After the write, so a refusal by the guards above records nothing.
    await recordAudit({
      req,
      action: "user_status_updated",
      targetType: "User",
      targetId: user._id,
      details: { isActive },
    })

    res.status(200).json({ success: true, user })
  } catch (err) {
    logger.error("Error updating user status", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error updating user status")
  }
}
