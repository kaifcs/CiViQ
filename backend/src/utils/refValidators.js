// Referential checks for foreign keys arriving from a client.
//
// Mongoose validates that a ref is a well-formed ObjectId but never that the
// document exists, so without these a project could be assigned to a deleted
// department or a deactivated user and fail only later, at render time.
//
// Both return an error message or null, matching utils/validators. `label`
// shapes the wording so one function serves several fields — a user reference
// reads as "project manager" or "supervisor" at the call site.

const mongoose = require("mongoose")
const Department = require("../models/Department")
const User = require("../models/User")

const STAFF_ROLES = ["admin", "officer", "supervisor"]

/** Requires the department to exist and still be active. */
async function validateDepartmentRef(departmentId, label = "department") {
  if (!mongoose.Types.ObjectId.isValid(departmentId)) return `Invalid ${label} ID`
  const department = await Department.findById(departmentId)
  if (!department) return `Referenced ${label} does not exist`
  if (!department.isActive) return `Cannot assign an inactive ${label}`
  return null
}


async function validateUserRef(userId, label = "user", roles) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return `Invalid ${label} ID`
  const user = await User.findById(userId)
  if (!user) return `Referenced ${label} does not exist`
  if (!user.isActive) return `Cannot assign an inactive ${label}`
  if (roles && !roles.includes(user.role)) return `A ${user.role} cannot be the ${label}`
  return null
}

module.exports = { validateDepartmentRef, validateUserRef, STAFF_ROLES }
