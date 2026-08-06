// Shared project ownership helpers.
// Extends existing auth middleware with resource-level authorization.

const mongoose = require("mongoose")
const Project = require("../models/Project")
const { invalidId, notFound, ERROR_CODES } = require("../utils/apiResponse")
const asyncHandler = require("../utils/asyncHandler")

// Filter that matches no projects (fail-closed).
// Uses $nor so it cannot be overridden by a later _id spread.
const DENY_ALL_PROJECTS = { $nor: [{}] }

/**
 * Returns the project visibility scope for a user.
 *
 * admin       -> all projects
 * officer     -> owned projects
 * supervisor  -> supervised projects
 * everyone else -> no projects
 */
function projectScopeFilter(user) {
  if (user?.role === "admin") return {}
  if (user?.role === "officer") return { officer: user._id }
  if (user?.role === "supervisor") return { supervisor: user._id }
  return DENY_ALL_PROJECTS
}

// Excludes soft-deleted projects from normal access.
const NOT_SOFT_DELETED = { isActive: { $ne: false } }

// Checks access for an already-loaded project.
function canAccessProject(user, project) {
  if (!project) return false
  if (user?.role === "admin") return true
  if (user?.role === "officer") return String(project.officer) === String(user._id)
  if (user?.role === "supervisor") return String(project.supervisor) === String(user._id)
  return false
}

/**
 * Ensures the current user can access the requested project.
 * Returns 404 for inaccessible projects to avoid resource enumeration.
 */
const requireProjectAccess = asyncHandler(async function requireProjectAccess(req, res, next) {
  const { id } = req.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return invalidId(res, "project")
  }

  const project = await Project.findOne({
    _id: id,
    ...NOT_SOFT_DELETED,
    ...projectScopeFilter(req.user),
  })
    .select("_id officer supervisor")
    .lean()

  if (!project) {
    return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)
  }

  req.project = project
  next()
})

module.exports = {
  projectScopeFilter,
  canAccessProject,
  requireProjectAccess,
  NOT_SOFT_DELETED,
}