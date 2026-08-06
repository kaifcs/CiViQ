const mongoose = require("mongoose")
const Project = require("../models/Project")
const Conflict = require("../models/Conflict")
const { recordAudit } = require("../services/auditService")
const { calculateMCDM } = require("../services/mcdmEngine")
const { detectClashes } = require("../services/clashDetection")
const {
  buildClashDetectedPayload, createNotifications, notifyProjectApproved,
  notifyProjectRejected, notifyProjectAssigned, notifyProjectCompleted,
} = require("../services/notificationService")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { projectScopeFilter, NOT_SOFT_DELETED } = require("../middleware/ownership")
const {
  validateDepartmentRef: validateDepartmentRefShared,
  validateUserRef: validateUserRefShared,
  STAFF_ROLES,
} = require("../utils/refValidators")
const { pickWritable } = require("../utils/writableFields")
const { ERROR_CODES, badRequest, conflictError, notFound, sendWriteError, serverError } = require("../utils/apiResponse")

const DECIDABLE_STATUS = "pending"

// Progress updates are allowed only after approval and before completion.
const PROGRESSABLE_STATUSES = ["approved", "active"]

// Finished work is a historical record, not a draft. Editing it rewrote what
// was delivered: moving `startDate` after completion left `actualEndDate`
// before it, which the project analytics report as a negative average duration.
const TERMINAL_STATUSES = ["completed", "rejected"]


const WRITABLE_FIELDS = [
  "title",
  "department",
  "projectType",
  "description",
  "phase",
  "parentProject",
  "phaseNumber",
  "startDate",
  "endDate",
  "estimatedCost",
  "budgetSource",
  "tenderNumber",
  "contractorName",
  "contractorFirm",
  "location",
  "mcdmInputs",
  "priority",
  "supervisor",
  "projectManager",
  "documents",
]

// Shared reference validators.
const validateDepartmentRef = (departmentId) => validateDepartmentRefShared(departmentId, "department")
// A project manager only has to be staff — nothing reads the field, so there is
// no narrower rule to derive. A supervisor must hold the supervisor role: the
// progress endpoint is gated on it, so any other assignee leaves the project
// impossible for anyone to complete.
const validateProjectManagerRef = (userId) => validateUserRefShared(userId, "project manager", STAFF_ROLES)
const validateSupervisorRef = (userId) => validateUserRefShared(userId, "supervisor", ["supervisor"])

function validateDateRange(startDate, endDate) {
  if (startDate !== undefined && startDate !== null && isNaN(new Date(startDate).getTime())) {
    return "Invalid startDate"
  }
  if (endDate !== undefined && endDate !== null && isNaN(new Date(endDate).getTime())) {
    return "Invalid endDate"
  }
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    return "endDate cannot be earlier than startDate"
  }
  return null
}

// Fields that affect MCDM or clash detection.
const MCDM_INPUT_FIELDS = ["mcdmInputs", "startDate", "projectType", "location"]
const CLASH_INPUT_FIELDS = ["location", "startDate", "endDate", "projectType"]

// Recompute when any relevant field is present.
const touches = (updates, fields) => fields.some((field) => updates[field] !== undefined)

/**
 * Brings a project's clash state back in line with reality after its geometry,
 * dates or work type changed, and reports the pairs that are newly in conflict.
 *
 * Mutates `hasClash` and `clashes` on the passed document but does NOT save it;
 * the caller persists once, together with any other recomputed state.
 *
 * Three rules, in order:
 *
 *   1. A pair that already has a Conflict row reuses it. The lookup tests both
 *      orderings because the pair is unordered (models/Conflict), which is what
 *      stops a repeated update from stacking duplicate rows for one collision.
 *   2. A pair with no row gets one, and is returned so the caller can notify.
 *   3. A `pending` conflict this re-run no longer finds is deleted. Only
 *      `pending` — that status means the row is a purely engine-derived fact
 *      that nothing human has touched, exactly like `hasClash` itself, and it
 *      is now false. `awaiting_officer` and both `resolved_*` states record a
 *      decision an administrator or officer actually made, so they are left
 *      untouched however the project moves afterwards.
 *
 * Stale rows are matched by their project references rather than by the
 * project's own `clashes` array: that array only ever holds the conflicts the
 * project itself detected, so a collision recorded by the OTHER side would
 * otherwise be missed and linger forever.
 */
async function reconcileProjectClashes(project) {
  const clashes = await detectClashes(project)

  const currentIds = []
  const created = []

  for (const clash of clashes) {
    let conflict = await Conflict.findOne({
      $or: [
        { project1: project._id, project2: clash.projectId },
        { project1: clash.projectId, project2: project._id },
      ],
    })
    if (!conflict) {
      conflict = await Conflict.create({
        project1: project._id,
        project2: clash.projectId,
        clashTypes: clash.clashTypes,
        severity: clash.severity,
      })
      created.push(clash)
    }
    currentIds.push(conflict._id)
  }

  const stale = await Conflict.find({
    status: "pending",
    _id: { $nin: currentIds },
    $or: [{ project1: project._id }, { project2: project._id }],
  }).select("_id").lean()

  if (stale.length > 0) {
    const staleIds = stale.map((c) => c._id)
    await Conflict.deleteMany({ _id: { $in: staleIds }, status: "pending" })
    // The other side of a pair can hold the same reference; clearing it there
    // too keeps `clashes` from pointing at a row that no longer exists.
    await Project.updateMany(
      { clashes: { $in: staleIds } },
      { $pull: { clashes: { $in: staleIds } } }
    )
  }

  project.clashes = currentIds
  project.hasClash = currentIds.length > 0

  return created
}


exports.getProjects = async (req, res) => {
  try {
    // Same rules the single-project routes enforce, from one definition each:
    // who may see it, and whether it has been soft-deleted.
    const filter = { ...NOT_SOFT_DELETED, ...projectScopeFilter(req.user) }
    const page = parsePagination(req.query)
    let q = Project.find(filter)
      .populate("officer supervisor","fullName email department")
      .populate("department", "name code")
      .populate("projectManager", "fullName email")
      .sort("-createdAt")
    if (page.enabled) q = q.skip(page.skip).limit(page.limit)

    // lean(): read-only; Project has no toJSON transform.
    // The count is independent of the page, so it rides alongside the read
    // rather than after it — one round trip instead of two.
    const [projects, total] = await Promise.all([
      q.lean(),
      page.enabled ? Project.countDocuments(filter) : null,
    ])
    if (page.enabled) setPaginationHeaders(res, total, page)
    res.json(projects)
  } catch (err) { serverError(res, err, "projectsController:") }
}

exports.getProject = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid project ID")
    }
    const project = await Project.findById(req.params.id)
      // Match the list endpoint projection.
      .populate("officer supervisor", "fullName email department")
      .populate("department", "name code")
      .populate("projectManager", "fullName email")
    if (!project) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)
    res.json(project)
  } catch (err) { serverError(res, err, "projectsController:") }
}

exports.createProject = async (req, res) => {
  try {
 
    const departmentId = req.body.department || req.user.department
    if (!departmentId) {
      return badRequest(res, "Department is required")
    }
    const departmentError = await validateDepartmentRef(departmentId)
    if (departmentError) {
      return badRequest(res, departmentError)
    }

    if (req.body.projectManager) {
      const managerError = await validateProjectManagerRef(req.body.projectManager)
      if (managerError) {
        return badRequest(res, managerError)
      }
    }

    if (req.body.supervisor) {
      const supervisorError = await validateSupervisorRef(req.body.supervisor)
      if (supervisorError) {
        return badRequest(res, supervisorError)
      }
    }

    const dateError = validateDateRange(req.body.startDate, req.body.endDate)
    if (dateError) {
      return badRequest(res, dateError)
    }

    const projectData = {
      ...pickWritable(req.body, WRITABLE_FIELDS),
      officer: req.user._id,
      department: departmentId,
      createdBy: req.user._id,
      mcdmInputs: req.body.mcdmInputs || {},
    }

    const mcdm = await calculateMCDM(projectData)
    projectData.mcdmScore = mcdm.score
    projectData.mcdmBreakdown = mcdm.breakdown

    const project = await Project.create(projectData)

    const clashes = await detectClashes(project)
    if (clashes.length > 0) {
      project.hasClash = true

      const clashProjects = await Project.find({ _id: { $in: clashes.map((c) => c.projectId) } })
      const projectById = new Map(clashProjects.map((p) => [String(p._id), p]))

      const notificationPayloads = []
      for (const clash of clashes) {
        let conflict = await Conflict.findOne({
          $or: [
            { project1: project._id, project2: clash.projectId },
            { project1: clash.projectId, project2: project._id },
          ],
        })
        if (!conflict) {
          conflict = await Conflict.create({
            project1: project._id,
            project2: clash.projectId,
            clashTypes: clash.clashTypes,
            severity: clash.severity,
          })
        }
        project.clashes.push(conflict._id)

        const otherProject = projectById.get(String(clash.projectId))
        if (otherProject) {
          notificationPayloads.push(buildClashDetectedPayload(req.user._id, project, otherProject))
          // The officer already holding the ground needs telling too. Same
          // builder, with the projects swapped so the message reads from their
          // side. Skipped when both projects belong to the same officer.
          const otherOfficer = otherProject.officer
          if (otherOfficer && String(otherOfficer) !== String(req.user._id)) {
            notificationPayloads.push(buildClashDetectedPayload(otherOfficer, otherProject, project))
          }
        }
      }

      await createNotifications(notificationPayloads)
      await project.save()
    }

    await recordAudit({ req, action: "project_created", targetType: "Project", targetId: project._id })
    res.status(201).json({ project, mcdm, clashesDetected: clashes.length })
  } catch (err) { return sendWriteError(res, err, { resource: "project", context: "Error creating project:" }) }
}

exports.updateProject = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid project ID")
    }

    if (req.body.department !== undefined) {
      const departmentError = await validateDepartmentRef(req.body.department)
      if (departmentError) {
        return badRequest(res, departmentError)
      }
    }
    if (req.body.projectManager !== undefined && req.body.projectManager !== null) {
      const managerError = await validateProjectManagerRef(req.body.projectManager)
      if (managerError) {
        return badRequest(res, managerError)
      }
    }
    
    if (req.body.supervisor !== undefined && req.body.supervisor !== null) {
      const supervisorError = await validateSupervisorRef(req.body.supervisor)
      if (supervisorError) {
        return badRequest(res, supervisorError)
      }
    }

    // Whitelisted, so identity, ownership, workflow status and engine-computed
    // fields are unreachable from the body whatever the caller's role.
    const safeUpdates = pickWritable(req.body, WRITABLE_FIELDS)

    const existing = await Project.findById(req.params.id)
    if (!existing) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)

    // Checked before any write, so a refused edit leaves the record untouched —
    // including the MCDM and clash recomputation further down, which would
    // otherwise re-score finished work.
    if (TERMINAL_STATUSES.includes(existing.status)) {
      return conflictError(res, `A ${existing.status} project can no longer be edited`)
    }

    const dateError = validateDateRange(
      safeUpdates.startDate !== undefined ? safeUpdates.startDate : existing.startDate,
      safeUpdates.endDate !== undefined ? safeUpdates.endDate : existing.endDate
    )
    if (dateError) {
      return badRequest(res, dateError)
    }

    const project = await Project.findByIdAndUpdate(req.params.id, safeUpdates, {
      new: true,
      runValidators: true,
    })

    // Recompute derived data only when relevant fields change.
    const rescore = touches(safeUpdates, MCDM_INPUT_FIELDS)
    const redetect = touches(safeUpdates, CLASH_INPUT_FIELDS)
    let newClashes = []

    if (rescore) {
      const mcdm = await calculateMCDM(project)
      project.mcdmScore = mcdm.score
      project.mcdmBreakdown = mcdm.breakdown
    }
    if (redetect) {
      newClashes = await reconcileProjectClashes(project)
    }
    if (rescore || redetect) {
      await project.save()
    }

    await recordAudit({ req, action: "project_updated", targetType: "Project", targetId: project._id })

    // Notify only for newly detected clashes.
    if (newClashes.length > 0) {
      const others = await Project.find({ _id: { $in: newClashes.map((c) => c.projectId) } })
      const payloads = []
      for (const other of others) {
        payloads.push(buildClashDetectedPayload(req.user._id, project, other))
        // The officer already holding the ground is the one who most needs to
        // hear that someone has moved onto it. Same builder with the projects
        // swapped, skipped when both belong to the same officer.
        if (other.officer && String(other.officer) !== String(req.user._id)) {
          payloads.push(buildClashDetectedPayload(other.officer, other, project))
        }
      }
      await createNotifications(payloads)
    }

    // Supervisor assignment happens through this route. Only a change fires a
    // notification, so re-saving the same supervisor stays silent.
    const previousSupervisor = existing.supervisor ? String(existing.supervisor) : null
    const nextSupervisor = project.supervisor ? String(project.supervisor) : null
    if (nextSupervisor && nextSupervisor !== previousSupervisor) {
      await notifyProjectAssigned(project.supervisor, project)
    }

    res.json(project)
  } catch (err) { return sendWriteError(res, err, { resource: "project", context: "Error updating project:" }) }
}

exports.approveProject = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid project ID")
    }
    const project = await Project.findOne({ _id: req.params.id, ...NOT_SOFT_DELETED }).populate("officer", "fullName email department")
    if (!project) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)
    if (project.status !== DECIDABLE_STATUS) {
      return conflictError(res, `Only a ${DECIDABLE_STATUS} project can be approved (current status: ${project.status})`)
    }

    project.status = "approved"
    project.adminNote = req.body.note
    await project.save()
    // Guarded because `officer` is optional on the schema: an unset one must not
    // turn a committed approval into a 500 with no audit entry written.
    if (project.officer) await notifyProjectApproved(project.officer._id, project)
    await recordAudit({ req, action: "project_approved", targetType: "Project", targetId: project._id })
    res.json(project)
  } catch (err) { serverError(res, err, "projectsController:") }
}

exports.rejectProject = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid project ID")
    }
    const project = await Project.findOne({ _id: req.params.id, ...NOT_SOFT_DELETED }).populate("officer", "fullName email department")
    if (!project) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)
    if (project.status !== DECIDABLE_STATUS) {
      return conflictError(res, `Only a ${DECIDABLE_STATUS} project can be rejected (current status: ${project.status})`)
    }

    project.status = "rejected"
    project.rejectionReason = req.body.reason
    project.suggestedDate = req.body.suggestedDate
    await project.save()
    // Same guard as approve: a missing officer must not abort the trail.
    if (project.officer) await notifyProjectRejected(project.officer._id, project, req.body.suggestedDate)
    await recordAudit({ req, action: "project_rejected", targetType: "Project", targetId: project._id, details: { reason: req.body.reason } })
    res.json(project)
  } catch (err) { serverError(res, err, "projectsController:") }
}

exports.updateProgress = async (req, res) => {
  try {
    // Normalize and validate progress once.
    const raw = req.body.progress
    const progress = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw
    if (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 100) {
      return badRequest(res, "progress must be a number between 0 and 100")
    }

    const project = await Project.findById(req.params.id)
    if (!project) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)
    if (!PROGRESSABLE_STATUSES.includes(project.status)) {
      return conflictError(
        res,
        `Progress can only be recorded on an approved or active project (current status: ${project.status})`
      )
    }

    // Always false given the guard above; kept so that widening
    // PROGRESSABLE_STATUSES cannot silently start re-announcing a completion.
    const wasCompleted = project.status === "completed"
    project.progress = progress
    if (progress === 100) {
      project.status = "completed"
      project.actualEndDate = new Date()
    } else if (progress > 0 && project.status === "approved") {
      // approved -> active: the one transition into `active` that the lifecycle
      // declares but nothing implemented, so the status was unreachable and the
      // dashboard's "active projects" figure was permanently zero. Recording
      // real progress is what makes work in flight; going straight to 100 skips
      // it, which is correct — the project is finished, not active.
      project.status = "active"
    }
    await project.save()
    await recordAudit({ req, action: "progress_updated", targetType: "Project", targetId: project._id, details: { progress } })

    // Notify the officer on completion.
    if (!wasCompleted && project.status === "completed" && project.officer) {
      await notifyProjectCompleted(project.officer, project)
    }

    res.json(project)
  } catch (err) { serverError(res, err, "projectsController:") }
}

exports.updateProjectStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid project ID")
    }

    const { isActive } = req.body
    if (typeof isActive !== "boolean") {
      return badRequest(res, "Please provide a valid boolean isActive status")
    }

    const project = await Project.findByIdAndUpdate(req.params.id, { isActive }, { new: true })
    if (!project) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)

    await recordAudit({
      req,
      action: "project_status_updated",
      targetType: "Project",
      targetId: project._id,
      details: { isActive },
    })

    res.json(project)
  } catch (err) { serverError(res, err, "projectsController:") }
}
