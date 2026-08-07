// Resource-level authorization for projects, layered on the auth middleware.
// The visibility rule lives here alone, exposed three ways so the list and the
// single-resource routes cannot drift apart.

const mongoose = require("mongoose")
const Project = require("../models/Project")
const { invalidId, notFound, ERROR_CODES } = require("../utils/apiResponse")
const asyncHandler = require("../utils/asyncHandler")

// Fail-closed. $nor so it cannot be cancelled out by a later _id spread.
const DENY_ALL_PROJECTS = { $nor: [{}] }

// Any role beyond the three named sees nothing, rather than everything.
function projectScopeFilter(user) {
  if (user?.role === "admin") return {}
  if (user?.role === "officer") return { officer: user._id }
  if (user?.role === "supervisor") return { supervisor: user._id }
  return DENY_ALL_PROJECTS
}

const NOT_SOFT_DELETED = { isActive: { $ne: false } }

// Compared by string value, so a lean ObjectId and a JSON string both match.
function canAccessProject(user, project) {
  if (!project) return false
  if (user?.role === "admin") return true
  if (user?.role === "officer") return String(project.officer) === String(user._id)
  if (user?.role === "supervisor") return String(project.supervisor) === String(user._id)
  return false
}

// An inaccessible project returns 404, not 403, so ids cannot be probed.
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