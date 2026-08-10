// Citizen complaint intake and handling. There is no ownership filter: triage
// depends on whoever is available, so assignment is an operational routing
// decision rather than an access control one.

const mongoose = require("mongoose")
const Complaint = require("../models/Complaint")
const analytics = require("../services/analyticsService")
const { validateDepartmentRef, validateUserRef, STAFF_ROLES } = require("../utils/refValidators")
const { recordAudit } = require("../services/auditService")
const { notifyComplaintAssigned, notifyComplaintStatusChanged } = require("../services/notificationService")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { pickWritable: pickFields } = require("../utils/writableFields")
const { serialiseComplaint, serialiseComplaints } = require("../utils/serializers")
const { ERROR_CODES, badRequest, conflictError, forbidden, notFound, sendWriteError, serverError } = require("../utils/apiResponse")

const COMPLAINT_STATUSES = Complaint.schema.path("status").enumValues
const ISSUE_TYPES = Complaint.schema.path("issueType").enumValues

// This is the one public list in the API, so an unpaginated read is capped.
// Callers needing more page through; callers needing totals use GET /stats.
const MAX_UNPAGINATED = 200

// Filters GET /stats honours; `department` is deliberately absent.
const PUBLIC_STAT_FILTERS = ["from", "to", "ward", "status", "complaintStatus"]

// What a REPORTER may supply. The public intake is reachable by anybody, so
// workflow state is absent: a complaint always begins "submitted" and
// unassigned, and only the role-gated PATCH routes move it from there.
const CREATE_WRITABLE_FIELDS = [
  "issueType",
  "description",
  "location",
  "photoUrl",
]

const TERMINAL_STATUS = "resolved"

function blocksStatusChange(currentStatus, nextStatus) {
  if (nextStatus === undefined) return null
  if (currentStatus !== TERMINAL_STATUS) return null
  // Re-sending the same status is idempotent, so it is not a transition.
  if (nextStatus === TERMINAL_STATUS) return null
  return `A ${TERMINAL_STATUS} complaint cannot be moved back to ${nextStatus}`
}

// Assignment is restricted to authorized roles and shared across both routes.
const ASSIGNMENT_ROLES = ["admin", "officer"]
exports.ASSIGNMENT_ROLES = ASSIGNMENT_ROLES

// The subset of WRITABLE_FIELDS that ASSIGNMENT_ROLES governs.
const ASSIGNMENT_FIELDS = ["assignedDepartment", "assignedOfficer"]

// What a role-gated update may write: the reporter fields plus workflow state.
const WRITABLE_FIELDS = [
  ...CREATE_WRITABLE_FIELDS,
  "status",
  "resolutionNote",
  ...ASSIGNMENT_FIELDS,
]

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const pickWritable = (body) => pickFields(body, WRITABLE_FIELDS)

async function validateAssignmentRefs({ assignedDepartment, assignedOfficer }) {
  if (assignedDepartment !== undefined && assignedDepartment !== null && assignedDepartment !== "") {
    const err = await validateDepartmentRef(assignedDepartment, "department")
    if (err) return err
  }
  if (assignedOfficer !== undefined && assignedOfficer !== null && assignedOfficer !== "") {
    // Staff only: a citizen assignee could not act on the complaint, and the
    // assignment notification quotes the CNR and issue type.
    const err = await validateUserRef(assignedOfficer, "assigned officer", STAFF_ROLES)
    if (err) return err
  }
  return null
}


exports.getComplaints = async (req, res) => {
  try {
    const { status, department, assignedOfficer, issueType, from, to, search } = req.query
    const filter = {}

    // Assignment fields are redacted publicly, so related filters are dropped.
    const staffCaller = Boolean(req.user)

    // Express parses ?status[$ne]=x into an object, which would reach the query
    // as a Mongo operator, so every scalar filter is validated or coerced first.
    if (status) {
      if (!COMPLAINT_STATUSES.includes(status)) {
        return badRequest(res, `status must be one of: ${COMPLAINT_STATUSES.join(", ")}`)
      }
      filter.status = status
    }
    if (department && staffCaller) filter.assignedDepartment = String(department)
    if (issueType) {
      if (!ISSUE_TYPES.includes(issueType)) {
        return badRequest(res, `issueType must be one of: ${ISSUE_TYPES.join(", ")}`)
      }
      filter.issueType = issueType
    }

    if (assignedOfficer && staffCaller) {
      if (!mongoose.Types.ObjectId.isValid(assignedOfficer)) {
        return badRequest(res, "Invalid assigned officer ID")
      }
      filter.assignedOfficer = assignedOfficer
    }

    if (from || to) {
      filter.createdAt = {}
      if (from) {
        if (isNaN(new Date(from).getTime())) return badRequest(res, "Invalid 'from' date")
        filter.createdAt.$gte = new Date(from)
      }
      if (to) {
        if (isNaN(new Date(to).getTime())) return badRequest(res, "Invalid 'to' date")
        filter.createdAt.$lte = new Date(to)
      }
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i")
      filter.$or = [
        { cnrId: rx },
        { description: rx },
        { "location.address": rx },
        { "location.ward": rx },
      ]
    }

    const page = parsePagination(req.query)
    let q = Complaint.find(filter).sort("-createdAt")
    q = page.enabled ? q.skip(page.skip).limit(page.limit) : q.limit(MAX_UNPAGINATED)

    // The count rides alongside the read: one round trip instead of two.
    const [complaints, total] = await Promise.all([q.lean(), Complaint.countDocuments(filter)])

    if (page.enabled) setPaginationHeaders(res, total, page)
    // Always reported, so a caller can tell a capped read from a complete one.
    else res.set("X-Total-Count", String(total))

    res.json(serialiseComplaints(complaints, req.user))
  } catch (err) { serverError(res, err, "complaintsController:") }
}

// Public city-wide figures from the shared analytics service.
exports.getComplaintStats = async (req, res) => {
  try {
    // `department` is not forwarded: `assignedDepartment` is redacted for an
    // unauthenticated caller, and a per-department count would hand it back.
    const query = {}
    for (const key of PUBLIC_STAT_FILTERS) {
      if (req.query[key] !== undefined) query[key] = req.query[key]
    }

    const stats = await analytics.getComplaintAnalytics(query)
    if (stats?.error) return badRequest(res, stats.error)

    // Whitelisted, so a field added to the analytics payload later is not
    // published by accident. Internal allocation is deliberately excluded.
    res.json({
      total: stats.total,
      open: stats.open,
      closed: stats.closed,
      byStatus: stats.byStatus,
      byIssueType: stats.byIssueType,
      byWard: stats.byWard,
      monthly: stats.monthly,
      resolvedMonthly: stats.resolvedMonthly,
      averages: stats.averages,
    })
  } catch (err) { serverError(res, err, "complaintsController:") }
}

// GET /api/complaints/:id  — accepts either a Mongo _id or a CNR ID.
exports.getComplaint = async (req, res) => {
  try {
    const { id } = req.params
    const clauses = [{ cnrId: id }]
    if (mongoose.Types.ObjectId.isValid(id)) clauses.unshift({ _id: id })

    const complaint = await Complaint.findOne({ $or: clauses })
    if (!complaint) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)
    res.json(serialiseComplaint(complaint, req.user))
  } catch (err) { serverError(res, err, "complaintsController:") }
}

// POST /api/complaints
exports.createComplaint = async (req, res) => {
  try {
    // Server-owned fields are dropped rather than rejected, as elsewhere.
    const data = pickFields(req.body, CREATE_WRITABLE_FIELDS)

    // create(), not insertOne, so the cnrId pre-save hook runs.
    const complaint = await Complaint.create(data)

    await recordAudit({
      req,
      action: "complaint_created",
      targetType: "Complaint",
      targetId: complaint._id,
      details: { cnrId: complaint.cnrId, issueType: complaint.issueType },
    })

    res.status(201).json(complaint)
  } catch (err) { return sendWriteError(res, err, { resource: "complaint", context: "Error creating complaint:" }) }
}

// PUT /api/complaints/:id — general update.
exports.updateComplaint = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid complaint ID")
    }

    const updates = pickWritable(req.body)
    if (req.body.note !== undefined && updates.resolutionNote === undefined) {
      updates.resolutionNote = req.body.note
    }

    if (updates.status !== undefined && !COMPLAINT_STATUSES.includes(updates.status)) {
      return badRequest(res, `status must be one of: ${COMPLAINT_STATUSES.join(", ")}`)
    }
    if (updates.issueType !== undefined && !ISSUE_TYPES.includes(updates.issueType)) {
      return badRequest(res, `issueType must be one of: ${ISSUE_TYPES.join(", ")}`)
    }
    // Use the same authorization as the dedicated assignment route.
    const touchesAssignment = ASSIGNMENT_FIELDS.some((f) => updates[f] !== undefined)
    if (touchesAssignment && !ASSIGNMENT_ROLES.includes(req.user.role)) {
      return forbidden(res, "Not authorized to assign a complaint")
    }

    const refError = await validateAssignmentRefs(updates)
    if (refError) return badRequest(res, refError)

    // Read before write: the terminal-status guard needs the stored status, and
    // the notification below needs the previous assignment to detect a change.
    const before = await Complaint.findById(req.params.id).select("status assignedOfficer")
    if (!before) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)

    const refusal = blocksStatusChange(before.status, updates.status)
    if (refusal) return conflictError(res, refusal)

    const previousOfficer = before.assignedOfficer ? String(before.assignedOfficer) : null

    const complaint = await Complaint.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!complaint) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)

    await recordAudit({
      req,
      action: "complaint_updated",
      targetType: "Complaint",
      targetId: complaint._id,
      details: { fields: Object.keys(updates) },
    })

    // Notify only when the assignment actually changes.
    const newOfficer = complaint.assignedOfficer ? String(complaint.assignedOfficer) : null
    if (touchesAssignment && newOfficer && newOfficer !== previousOfficer) {
      await notifyComplaintAssigned(complaint.assignedOfficer, complaint, req.user._id)
    }
    
    res.json(complaint)
    } catch (err) { return sendWriteError(res, err, { resource: "complaint", context: "Error updating complaint:" }) }
  }

// PATCH /api/complaints/:id/status
exports.updateStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid complaint ID")
    }

    const { status } = req.body
    if (!COMPLAINT_STATUSES.includes(status)) {
      return badRequest(res, `status must be one of: ${COMPLAINT_STATUSES.join(", ")}`)
    }

    const before = await Complaint.findById(req.params.id).select("status")
    if (!before) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)

    const refusal = blocksStatusChange(before.status, status)
    if (refusal) return conflictError(res, refusal)

    const updates = { status }
    const note = req.body.note !== undefined ? req.body.note : req.body.resolutionNote
    if (note !== undefined) updates.resolutionNote = note

    const complaint = await Complaint.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!complaint) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)

    await recordAudit({
      req,
      action: "complaint_status_updated",
      targetType: "Complaint",
      targetId: complaint._id,
      details: { status: complaint.status },
    })

    // Pass the actor so the service can skip self-directed notifications.
    if (complaint.assignedOfficer) {
      await notifyComplaintStatusChanged(complaint.assignedOfficer, complaint, req.user._id)
    }

    res.json(complaint)
  } catch (err) { return sendWriteError(res, err, { resource: "complaint", context: "Error updating complaint status:" }) }
}

// PATCH /api/complaints/:id/assign
exports.assignComplaint = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid complaint ID")
    }

    const { assignedDepartment, assignedOfficer } = req.body
    if (assignedDepartment === undefined && assignedOfficer === undefined) {
      return badRequest(res, "Provide assignedDepartment and/or assignedOfficer")
    }

    const refError = await validateAssignmentRefs({ assignedDepartment, assignedOfficer })
    if (refError) return badRequest(res, refError)

    const before = await Complaint.findById(req.params.id).select("assignedOfficer")
    if (!before) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)
    const previousOfficer = before.assignedOfficer ? String(before.assignedOfficer) : null

    const updates = {}
    if (assignedDepartment !== undefined) updates.assignedDepartment = assignedDepartment || null
    if (assignedOfficer !== undefined) updates.assignedOfficer = assignedOfficer || null

    const complaint = await Complaint.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!complaint) return notFound(res, "Complaint not found", ERROR_CODES.COMPLAINT_NOT_FOUND)

    await recordAudit({
      req,
      action: "complaint_assigned",
      targetType: "Complaint",
      targetId: complaint._id,
      details: {
        assignedDepartment: complaint.assignedDepartment,
        assignedOfficer: complaint.assignedOfficer,
      },
    })

    // Actor passed for the same reason as the other producers: an officer who
    // assigns a complaint to themselves already knows.
    const newOfficer = complaint.assignedOfficer ? String(complaint.assignedOfficer) : null
    if (newOfficer && newOfficer !== previousOfficer) {
      await notifyComplaintAssigned(complaint.assignedOfficer, complaint, req.user._id)
    }

    res.json(complaint)
  } catch (err) { return sendWriteError(res, err, { resource: "complaint", context: "Error assigning complaint:" }) }
}
