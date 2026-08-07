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

// Progress applies only after approval and before completion.
const PROGRESSABLE_STATUSES = ["approved", "active"]

// Finished work is a historical record, not a draft, so it is immutable.
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

const validateDepartmentRef = (departmentId) => validateDepartmentRefShared(departmentId, "department")
// A supervisor must hold the supervisor role: the progress endpoint is gated on
// it, so any other assignee leaves the project impossible to complete.
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

// The engines re-run only for updates that touch what they read.
const MCDM_INPUT_FIELDS = ["mcdmInputs", "startDate", "projectType", "location"]
const CLASH_INPUT_FIELDS = ["location", "startDate", "endDate", "projectType"]

const touches = (updates, fields) => fields.some((field) => updates[field] !== undefined)

// Synchronizes the derived clash state for all affected projects.
async function syncClashState(projectIds = []) {
  // Deduplicated, keeping the caller's id form so the filter still casts.
  const wanted = new Map()
  for (const id of projectIds) if (id) wanted.set(String(id), id)
  if (wanted.size === 0) return new Map()

  const ids = [...wanted.values()]
  const conflicts = await Conflict.find({
    $or: [{ project1: { $in: ids } }, { project2: { $in: ids } }],
  })
    .select("project1 project2")
    .lean()

  const byProject = new Map([...wanted.keys()].map((id) => [id, []]))
  for (const conflict of conflicts) {
    // Both sides are credited; a side outside `wanted` is never written blind.
    for (const side of [conflict.project1, conflict.project2]) {
      byProject.get(String(side))?.push(conflict._id)
    }
  }

  await Project.bulkWrite(
    [...byProject].map(([id, clashes]) => ({
      updateOne: {
        filter: { _id: wanted.get(id) },
        update: { $set: { clashes, hasClash: clashes.length > 0 } },
      },
    }))
  )

  return byProject
}

// Recomputes clash state after project updates.
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

  // A deleted conflict affects both linked projects.
  const stale = await Conflict.find({
    status: "pending",
    _id: { $nin: currentIds },
    $or: [{ project1: project._id }, { project2: project._id }],
  }).select("project1 project2").lean()

  // Every project whose set of conflicts may have changed.
  const affected = [project._id, ...clashes.map((c) => c.projectId)]

  if (stale.length > 0) {
    await Conflict.deleteMany({ _id: { $in: stale.map((c) => c._id) }, status: "pending" })
    for (const c of stale) affected.push(c.project1, c.project2)
  }

  const synced = await syncClashState(affected)
  project.clashes = synced.get(String(project._id)) || []
  project.hasClash = project.clashes.length > 0

  return created
}


exports.getProjects = async (req, res) => {
  try {
    // The same scope and soft-delete rules the single-project routes enforce.
    const filter = { ...NOT_SOFT_DELETED, ...projectScopeFilter(req.user) }
    const page = parsePagination(req.query)
    let q = Project.find(filter)
      .populate("officer supervisor","fullName email department")
      .populate("department", "name code")
      .populate("projectManager", "fullName email")
      .sort("-createdAt")
    if (page.enabled) q = q.skip(page.skip).limit(page.limit)

    // The count rides alongside the read: one round trip instead of two.
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

        const otherProject = projectById.get(String(clash.projectId))
        if (otherProject) {
          notificationPayloads.push(buildClashDetectedPayload(req.user._id, project, otherProject))
          // The officer already holding the ground is told too, with the
          // projects swapped so the message reads from their side.
          const otherOfficer = otherProject.officer
          if (otherOfficer && String(otherOfficer) !== String(req.user._id)) {
            notificationPayloads.push(buildClashDetectedPayload(otherOfficer, otherProject, project))
          }
        }
      }

      // Synchronize clash state for both projects.
      const synced = await syncClashState([project._id, ...clashes.map((c) => c.projectId)])
      project.clashes = synced.get(String(project._id)) || []
      project.hasClash = project.clashes.length > 0

      await createNotifications(notificationPayloads)
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

    // Whitelisted, so ownership, workflow status and engine-computed fields
    // stay unreachable from the body whatever the caller's role.
    const safeUpdates = pickWritable(req.body, WRITABLE_FIELDS)

    const existing = await Project.findById(req.params.id)
    if (!existing) return notFound(res, "Project not found", ERROR_CODES.PROJECT_NOT_FOUND)

    // Checked before any write, so a refused edit re-scores nothing either.
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

    if (newClashes.length > 0) {
      const others = await Project.find({ _id: { $in: newClashes.map((c) => c.projectId) } })
      const payloads = []
      for (const other of others) {
        payloads.push(buildClashDetectedPayload(req.user._id, project, other))
        // The officer already holding the ground is told too, with the
        // projects swapped so the message reads from their side.
        if (other.officer && String(other.officer) !== String(req.user._id)) {
          payloads.push(buildClashDetectedPayload(other.officer, other, project))
        }
      }
      await createNotifications(payloads)
    }

    // Only an actual change notifies, so re-saving the same supervisor is silent.
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
    // `officer` is optional on the schema, and an unset one must not turn a
    // committed approval into a 500 with no audit entry written.
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
    // Same guard as approve.
    if (project.officer) await notifyProjectRejected(project.officer._id, project, req.body.suggestedDate)
    await recordAudit({ req, action: "project_rejected", targetType: "Project", targetId: project._id, details: { reason: req.body.reason } })
    res.json(project)
  } catch (err) { serverError(res, err, "projectsController:") }
}

exports.updateProgress = async (req, res) => {
  try {
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

    // Always false given the guard above; kept so widening
    // PROGRESSABLE_STATUSES cannot start re-announcing a completion.
    const wasCompleted = project.status === "completed"
    project.progress = progress
    if (progress === 100) {
      project.status = "completed"
      project.actualEndDate = new Date()
    } else if (progress > 0 && project.status === "approved") {
      // Recording real progress is what makes work in flight. Going straight
      // to 100 skips this, correctly: the project is finished, not active.
      project.status = "active"
    }
    await project.save()
    await recordAudit({ req, action: "progress_updated", targetType: "Project", targetId: project._id, details: { progress } })

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
