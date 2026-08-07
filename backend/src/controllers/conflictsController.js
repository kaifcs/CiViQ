// Conflict review and resolution.

const mongoose = require("mongoose")
const Conflict = require("../models/Conflict")
const Project = require("../models/Project")
const { recordAudit } = require("../services/auditService")
const { getSuggestedStartDate, detectClashes } = require("../services/clashDetection")
const { notifyProjectApproved, notifyProjectRejected } = require("../services/notificationService")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { canAccessProject } = require("../middleware/ownership")
const { serialiseConflict, serialiseConflicts } = require("../utils/serializers")
const { ERROR_CODES, badRequest, conflictError, forbidden, notFound, serverError } = require("../utils/apiResponse")

const RESOLUTION_ACTIONS = Conflict.schema.path("adminResolution.action").enumValues
const RESPONSE_ACTIONS = Conflict.schema.path("officerResponse.action").enumValues

// Conflict resolution writes Project.status directly, so it must enforce
// workflow preconditions itself.

// Finished projects are immutable.
const TERMINAL_STATUSES = ["completed", "rejected"]

// A rescheduled project is awaiting the officer's decision.
// Another conflict must not rewrite its status.
const AWAITING_OFFICER_STATUS = "rescheduled"

// Already-authorized projects keep their current workflow state.
// Never reset active work back to approved.
const ALREADY_AUTHORISED_STATUSES = ["approved", "active"]

// Returns a refusal message, or null when the write is allowed.
function blocksResolution(project, verb) {
  if (TERMINAL_STATUSES.includes(project.status)) {
    return `A ${project.status} project cannot be ${verb} (project: ${project.title})`
  }
  if (project.status === AWAITING_OFFICER_STATUS) {
    return `"${project.title}" is awaiting its officer's response to an earlier reschedule and cannot be ${verb} until they have answered`
  }
  return null
}

const CONFLICT_POPULATE = {
  path: "project1 project2",
  select: "title department projectType status mcdmScore officer supervisor startDate endDate location.centerCoords location.ward",
  populate: { path: "department", select: "name code" },
}

async function findRescheduledProject(conflict) {
  if (conflict.rescheduledProject) {
    const explicit = await Project.findById(conflict.rescheduledProject)
    if (explicit) return explicit
  }

  const [p1, p2] = await Promise.all([
    Project.findById(conflict.project1),
    Project.findById(conflict.project2),
  ])

  const p1Rescheduled = p1?.status === "rescheduled"
  const p2Rescheduled = p2?.status === "rescheduled"
  if (p1Rescheduled && !p2Rescheduled) return p1
  if (p2Rescheduled && !p1Rescheduled) return p2

  if (Number.isFinite(p1?.mcdmScore) && Number.isFinite(p2?.mcdmScore)) {
    return p1.mcdmScore < p2.mcdmScore ? p1 : p2
  }
  return p1
}

exports.getConflicts = async (req, res) => {
  try {
    const page = parsePagination(req.query)
    let q = Conflict.find().populate(CONFLICT_POPULATE).sort("-createdAt")
    if (page.enabled) q = q.skip(page.skip).limit(page.limit)

    const conflicts = await q.lean()
    if (page.enabled) setPaginationHeaders(res, await Conflict.countDocuments(), page)
    res.json(serialiseConflicts(conflicts, req.user))
  } catch (err) { serverError(res, err, "conflictsController:") }
}

exports.getConflict = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid conflict ID")
    }
    const conflict = await Conflict.findById(req.params.id).populate(CONFLICT_POPULATE)
    if (!conflict) return notFound(res, "Conflict not found", ERROR_CODES.CONFLICT_NOT_FOUND)
    res.json(serialiseConflict(conflict, req.user))
  } catch (err) { serverError(res, err, "conflictsController:") }
}

exports.resolveConflict = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid conflict ID")
    }

    const conflict = await Conflict.findById(req.params.id)
    if (!conflict) return notFound(res, "Conflict not found", ERROR_CODES.CONFLICT_NOT_FOUND)

    const { action, coordinationNote, overrideCategory, overrideReason, overrideRef } = req.body

    if (!RESOLUTION_ACTIONS.includes(action)) {
      return badRequest(res, `action must be one of: ${RESOLUTION_ACTIONS.join(", ")}`)
    }
    if (conflict.status !== "pending") {
      return conflictError(res, `Conflict has already been actioned (status: ${conflict.status})`)
    }

    const p1 = await Project.findById(conflict.project1)
    const p2 = await Project.findById(conflict.project2)
    if (!p1 || !p2) {
      return notFound(res, "One or both referenced projects no longer exist", ERROR_CODES.CONFLICT_NOT_FOUND)
    }

    conflict.adminResolution = { action, coordinationNote, overrideCategory, overrideReason, overrideRef, resolvedBy: req.user._id, resolvedAt: new Date() }

    // Dispatched only once the conflict is saved, so nothing is announced for
    // a resolution that failed to persist.
    const pending = []

    if (action === "approve_both") {
      // Both checked before either is written, so a refusal writes nothing.
      for (const p of [p1, p2]) {
        const refusal = blocksResolution(p, "approved")
        if (refusal) return conflictError(res, refusal)
      }

      conflict.status = "resolved_both"

      // Only a project still awaiting a decision is moved, so an officer is
      // never told again about an approval they already hold.
      for (const p of [p1, p2]) {
        if (ALREADY_AUTHORISED_STATUSES.includes(p.status)) continue
        await Project.findByIdAndUpdate(p._id, { status: "approved" })
        if (p.officer) pending.push(() => notifyProjectApproved(p.officer, p))
      }
    } else if (action === "reject_lower") {
      const s1 = Number.isFinite(p1.mcdmScore) ? p1.mcdmScore : -Infinity
      const s2 = Number.isFinite(p2.mcdmScore) ? p2.mcdmScore : -Infinity
      const lower = s1 < s2 ? p1 : p2
      const higher = s1 >= s2 ? p1 : p2

      // Scoped to the loser: the winner is never rewritten, only read.
      const refusal = blocksResolution(lower, "rescheduled")
      if (refusal) return conflictError(res, refusal)

      const suggested = getSuggestedStartDate(higher)
      lower.status = "rescheduled"
      lower.suggestedDate = suggested
      await lower.save()
      conflict.suggestedDate = suggested
      conflict.status = "awaiting_officer"
      conflict.rescheduledProject = lower._id
      // Only the rescheduled side changed, so only its officer is told.
      if (lower.officer) pending.push(() => notifyProjectRejected(lower.officer, lower, suggested))
    }

    await conflict.save()
    const isOverride = !!overrideCategory
    await recordAudit({ req, action: "conflict_resolved", targetType: "Conflict", targetId: conflict._id, details: req.body, isOverride })
    for (const send of pending) await send()
    res.json(conflict)
  } catch (err) { serverError(res, err, "conflictsController:") }
}

exports.officerRespond = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid conflict ID")
    }

    const conflict = await Conflict.findById(req.params.id)
    if (!conflict) return notFound(res, "Conflict not found", ERROR_CODES.CONFLICT_NOT_FOUND)

    const { action, customDate } = req.body

    if (!RESPONSE_ACTIONS.includes(action)) {
      return badRequest(res, `action must be one of: ${RESPONSE_ACTIONS.join(", ")}`)
    }
    if (conflict.status !== "awaiting_officer") {
      return conflictError(res, "This conflict is not awaiting an officer response")
    }
    if (!conflict.suggestedDate) {
      return conflictError(res, "Conflict has no suggested date to respond to")
    }

    const project = await findRescheduledProject(conflict)
    if (!project) return notFound(res, "Rescheduled project not found", ERROR_CODES.CONFLICT_NOT_FOUND)
    if (!canAccessProject(req.user, project)) {
      return forbidden(res, "You can only respond for your own project")
    }

    if (action === "custom") {
      if (!customDate || isNaN(new Date(customDate).getTime())) {
        return badRequest(res, "A valid customDate is required")
      }
      if (new Date(customDate) < new Date(conflict.suggestedDate)) {
        return badRequest(res, "Custom date must be equal to or later than suggested date")
      }
    }

    const newDate = action === "accept" ? conflict.suggestedDate : customDate
    const start = new Date(newDate)
    const durationMs = Math.max(0, new Date(project.endDate) - new Date(project.startDate))
    project.startDate = start
    project.endDate = new Date(start.getTime() + durationMs)
    project.status = "pending"

    // Run against the in-memory project, so the new date is scored before save.
    const newClashes = await detectClashes(project)
    conflict.recheckPassed = newClashes.length === 0
    conflict.officerResponse = { action, customDate, respondedBy: req.user._id, respondedAt: new Date() }
    conflict.status = "resolved_rejected"

    await project.save()
    await conflict.save()
    await recordAudit({
      req,
      action: "conflict_responded",
      targetType: "Conflict",
      targetId: conflict._id,
      details: { action, customDate, newStartDate: project.startDate, recheckPassed: conflict.recheckPassed },
    })

    res.json({ conflict, recheckPassed: conflict.recheckPassed, newClashes })
  } catch (err) { serverError(res, err, "conflictsController:") }
}
