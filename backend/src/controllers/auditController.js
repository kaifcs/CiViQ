// Audit trail reads — administrator only.
//
// Read-only: nothing here writes to the trail. Entries are created by
// services/auditService from within the operation being recorded, so the
// trail cannot be edited through the API.

const mongoose = require("mongoose")
const AuditLog = require("../models/AuditLog")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { ERROR_CODES, badRequest, notFound, serverError } = require("../utils/apiResponse")

/**
 * Server-side filters for the trail.
 *
 * Filtering used to happen only in the browser, over the 200 most recent rows
 * the unpaginated read returns — so a filter silently missed everything older.
 * Applying it here narrows the query itself, and the paginated total counts the
 * same filtered set.
 *
 * Every value is validated or coerced before it reaches the query: a query
 * string parses `?action[$ne]=x` into an object, which would otherwise arrive
 * as a Mongo operator.
 */
function buildAuditFilter(query = {}) {
  const { action, performedBy, targetType, isOverride, from, to } = query
  const filter = {}

  if (action !== undefined && action !== "") filter.action = String(action)
  if (targetType !== undefined && targetType !== "") filter.targetType = String(targetType)

  if (performedBy !== undefined && performedBy !== "") {
    if (!mongoose.Types.ObjectId.isValid(performedBy)) {
      return { error: "Invalid performedBy ID" }
    }
    filter.performedBy = performedBy
  }

  if (isOverride !== undefined && isOverride !== "") {
    if (isOverride !== "true" && isOverride !== "false") {
      return { error: "isOverride must be true or false" }
    }
    filter.isOverride = isOverride === "true"
  }

  if (from !== undefined && from !== "") {
    if (isNaN(new Date(from).getTime())) return { error: "Invalid 'from' date" }
    filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) }
  }
  if (to !== undefined && to !== "") {
    if (isNaN(new Date(to).getTime())) return { error: "Invalid 'to' date" }
    filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) }
  }

  return { filter }
}

exports.getLogs = async (req, res) => {
  try {
    const { error, filter } = buildAuditFilter(req.query)
    if (error) return badRequest(res, error)

    const page = parsePagination(req.query)
    let q = AuditLog.find(filter).populate("performedBy","fullName role department").sort("-createdAt")
    // Capped when unpaginated: the trail grows without bound and the default
    // view only ever shows recent activity.
    q = page.enabled ? q.skip(page.skip).limit(page.limit) : q.limit(200)

    const logs = await q.lean()
    if (page.enabled) setPaginationHeaders(res, await AuditLog.countDocuments(filter), page)
    res.json(logs)
  } catch (err) { serverError(res, err, "auditController:") }
}

// GET /api/audit/:id
exports.getLog = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid audit log ID")
    }
    const log = await AuditLog.findById(req.params.id).populate("performedBy", "fullName role department")
    if (!log) return notFound(res, "Audit log not found", ERROR_CODES.AUDIT_LOG_NOT_FOUND)
    res.json(log)
  } catch (err) { serverError(res, err, "auditController:") }
}
