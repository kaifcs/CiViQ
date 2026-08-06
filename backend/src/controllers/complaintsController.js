// Citizen complaint intake and handling.
//
// Complaints have no ownership filter: unlike projects, any authenticated
// staff member may see any complaint, because triage depends on whoever is
// available rather than on who owns the record. Assignment is therefore an
// operational routing decision, not an access control one.
//
// Writable fields are whitelisted rather than blacklisted, so a field added to
// the schema later is not client-writable by accident.

const mongoose = require("mongoose")
const Complaint = require("../models/Complaint")
const { validateDepartmentRef, validateUserRef, STAFF_ROLES } = require("../utils/refValidators")
const { recordAudit } = require("../services/auditService")
const { notifyComplaintAssigned, notifyComplaintStatusChanged } = require("../services/notificationService")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { pickWritable: pickFields } = require("../utils/writableFields")
const { serialiseComplaint, serialiseComplaints } = require("../utils/serializers")
const { ERROR_CODES, badRequest, notFound, sendWriteError, serverError } = require("../utils/apiResponse")

const COMPLAINT_STATUSES = Complaint.schema.path("status").enumValues
const ISSUE_TYPES = Complaint.schema.path("issueType").enumValues

// What a REPORTER may supply. POST /api/complaints carries no `protect` — it is
// the public intake a resident uses without an account — so this list is
// reachable by anybody on the internet and holds only the description of the
// problem itself.
//
// `status`, `assignedDepartment` and `assignedOfficer` are deliberately absent.
// They are workflow state the server owns: a complaint always begins at the
// schema default of "submitted" and unassigned, and only the role-gated
// PATCH /:id/status and PATCH /:id/assign move them from there. They were
// previously in the one shared list below, so an unauthenticated caller could
// file a complaint already marked resolved and already attributed to a named
// officer — which fabricated the resolution counts and average resolution time
// reported on both the public citizen page and the admin dashboard.
const CREATE_WRITABLE_FIELDS = [
  "issueType",
  "description",
  "location",
  "photoUrl",
]

// What a role-gated update may write: everything a reporter may supply, plus the
// workflow state. PUT /:id is restricted to admin, officer and supervisor, so
// this list is only ever reached by an authenticated staff member.
const WRITABLE_FIELDS = [
  ...CREATE_WRITABLE_FIELDS,
  "status",
  "resolutionNote",
  "assignedDepartment",
  "assignedOfficer",
]

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Binds this module's field list to the shared whitelist helper, so complaints
// and projects apply the one implementation rather than a copy each.
const pickWritable = (body) => pickFields(body, WRITABLE_FIELDS)

async function validateAssignmentRefs({ assignedDepartment, assignedOfficer }) {
  if (assignedDepartment !== undefined && assignedDepartment !== null && assignedDepartment !== "") {
    const err = await validateDepartmentRef(assignedDepartment, "department")
    if (err) return err
  }
  if (assignedOfficer !== undefined && assignedOfficer !== null && assignedOfficer !== "") {
    // Staff only. Admin, officer and supervisor can all move a complaint's
    // status, so any of them is a legitimate assignee; a citizen is not. A
    // citizen assignee could not act on the complaint at all, and the
    // assignment notification — which quotes the CNR and issue type — would be
    // delivered to a member of the public.
    const err = await validateUserRef(assignedOfficer, "assigned officer", STAFF_ROLES)
    if (err) return err
  }
  return null
}


exports.getComplaints = async (req, res) => {
  try {
    const { status, department, assignedOfficer, issueType, from, to, search } = req.query
    const filter = {}

    // Express parses ?status[$ne]=x into an OBJECT, which would reach the query
    // as a Mongo operator. Each scalar filter is therefore validated or coerced
    // before use: the two enum fields against the same lists the write path
    // already checks, and the rest to a plain string.
    if (status) {
      if (!COMPLAINT_STATUSES.includes(status)) {
        return badRequest(res, `status must be one of: ${COMPLAINT_STATUSES.join(", ")}`)
      }
      filter.status = status
    }
    if (department) filter.assignedDepartment = String(department)
    if (issueType) {
      if (!ISSUE_TYPES.includes(issueType)) {
        return badRequest(res, `issueType must be one of: ${ISSUE_TYPES.join(", ")}`)
      }
      filter.issueType = issueType
    }

    if (assignedOfficer) {
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
    if (page.enabled) q = q.skip(page.skip).limit(page.limit)

    const complaints = await q.lean()
    if (page.enabled) setPaginationHeaders(res, await Complaint.countDocuments(filter), page)
    res.json(serialiseComplaints(complaints, req.user))
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
    // The reporter list, not the shared one: workflow state is server-owned and
    // is silently dropped rather than rejected, matching how every other
    // server-owned field on this API treats an unsolicited value.
    const data = pickFields(req.body, CREATE_WRITABLE_FIELDS)

    // create() (not insertOne) so the cnrId pre-save hook runs.
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

    const refError = await validateAssignmentRefs(updates)
    if (refError) return badRequest(res, refError)

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

    if (complaint.assignedOfficer) {
      await notifyComplaintStatusChanged(complaint.assignedOfficer, complaint)
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

    const newOfficer = complaint.assignedOfficer ? String(complaint.assignedOfficer) : null
    if (newOfficer && newOfficer !== previousOfficer) {
      await notifyComplaintAssigned(complaint.assignedOfficer, complaint)
    }

    res.json(complaint)
  } catch (err) { return sendWriteError(res, err, { resource: "complaint", context: "Error assigning complaint:" }) }
}
