// Every figure the dashboard reports, derived in one place.
//
// Aggregation happens in MongoDB rather than in JavaScript: each endpoint issues
// a single `$facet` pipeline per collection, so a dozen counts and groupings
// cost one round trip instead of a dozen. Independent collections are queried
// concurrently.
//
// Two conventions run through the file:
//
//   • Enum values are read from the schemas, never restated here, so a new
//     status appears in the results automatically and a removed one cannot
//     linger as a phantom bucket.
//   • A bad filter is REPORTED, not thrown — every entry point returns
//     `{ error }` for invalid input, which the controller turns into a 400
//     while genuine faults stay 500s.
//
// Filters are not uniform across collections, and deliberately so: ward lives
// at a different path per model, and the project and complaint status enums are
// disjoint, so one `status` value cannot serve both.

const mongoose = require("mongoose")
const Project = require("../models/Project")
const Conflict = require("../models/Conflict")
const Complaint = require("../models/Complaint")
const Department = require("../models/Department")
const User = require("../models/User")
const AuditLog = require("../models/AuditLog")
const Notification = require("../models/Notification")

const PROJECT_STATUSES = Project.schema.path("status").enumValues
const PROJECT_PRIORITIES = Project.schema.path("priority").enumValues
const PROJECT_TYPES = Project.schema.path("projectType").enumValues
const CONFLICT_STATUSES = Conflict.schema.path("status").enumValues
const CONFLICT_SEVERITIES = Conflict.schema.path("severity").enumValues
const COMPLAINT_STATUSES = Complaint.schema.path("status").enumValues
const COMPLAINT_ISSUE_TYPES = Complaint.schema.path("issueType").enumValues
const USER_ROLES = User.schema.path("role").enumValues

const PROJECT_TERMINAL_STATUSES = ["completed", "rejected"]
const CONFLICT_OPEN_STATUSES = ["pending", "awaiting_officer"]
const CONFLICT_RESOLVED_STATUSES = ["resolved_both", "resolved_rejected"]
const COMPLAINT_CLOSED_STATUSES = ["resolved"]
const COMPLAINT_OPEN_STATUSES = COMPLAINT_STATUSES.filter(
  (s) => !COMPLAINT_CLOSED_STATUSES.includes(s)
)

function firstCount(facetBucket) {
  return facetBucket && facetBucket[0] ? facetBucket[0].n : 0
}

function toBuckets(rows, allKeys) {
  const out = {}
  allKeys.forEach((k) => { out[k] = 0 })
  rows.forEach((r) => {
    const key = r._id === null || r._id === undefined ? "unspecified" : String(r._id)
    out[key] = r.count
  })
  return out
}

function groupStage(field) {
  return [{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]
}


function sumBuckets(buckets, keys) {
  return keys.reduce((acc, key) => acc + (buckets[key] || 0), 0)
}

function classifyConflicts(byStatus) {
  return {
    open: sumBuckets(byStatus, CONFLICT_OPEN_STATUSES),
    resolved: sumBuckets(byStatus, CONFLICT_RESOLVED_STATUSES),
  }
}

function classifyComplaints(byStatus) {
  return {
    open: sumBuckets(byStatus, COMPLAINT_OPEN_STATUSES),
    closed: sumBuckets(byStatus, COMPLAINT_CLOSED_STATUSES),
  }
}

function toDateOnlyMatch(match) {
  return match.createdAt ? { createdAt: match.createdAt } : {}
}

// Monthly series keyed YYYY-MM, oldest first.
function monthlyStage(dateField = "createdAt") {
  return [
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: `$${dateField}` } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: "$_id", count: 1 } },
  ]
}

// Ward and complaintStatus are carried alongside the Mongo match rather than
// inside it: ward lives at a different path per collection, and project and
// complaint status enums are disjoint so one `status` cannot serve both.
function buildFilters(query = {}) {
  const { department, from, to, status, priority, ward, complaintStatus } = query
  const match = {}
  const extra = {}

  if (ward !== undefined && ward !== "") {
    extra.ward = String(ward)
    match["location.ward"] = extra.ward
  }
  if (complaintStatus !== undefined && complaintStatus !== "") {
    if (!COMPLAINT_STATUSES.includes(complaintStatus)) {
      return { error: `complaintStatus must be one of: ${COMPLAINT_STATUSES.join(", ")}` }
    }
    extra.complaintStatus = complaintStatus
  }

  if (department !== undefined && department !== "") {
    if (!mongoose.Types.ObjectId.isValid(department)) {
      return { error: "Invalid department ID" }
    }
    match.department = new mongoose.Types.ObjectId(department)
  }

  if (from !== undefined && from !== "") {
    if (isNaN(new Date(from).getTime())) return { error: "Invalid 'from' date" }
    match.createdAt = { ...(match.createdAt || {}), $gte: new Date(from) }
  }
  if (to !== undefined && to !== "") {
    if (isNaN(new Date(to).getTime())) return { error: "Invalid 'to' date" }
    match.createdAt = { ...(match.createdAt || {}), $lte: new Date(to) }
  }

  // A single `status` query param might be meant for projects, conflicts, or
  // complaints, so we validate it against the union of all three enums.
  // This prevents silent empty results for typos while allowing a cross-domain
  // status (like "pending") to filter whatever it matches.
  if (status !== undefined && status !== "") {
    const s = String(status)
    const validStatuses = new Set([...PROJECT_STATUSES, ...CONFLICT_STATUSES, ...COMPLAINT_STATUSES])
    if (!validStatuses.has(s)) {
      return { error: `status must be one of: ${Array.from(validStatuses).join(", ")}` }
    }
    match.status = s
  }
  if (priority !== undefined && priority !== "") match.priority = String(priority)

  return { match, extra, departmentId: match.department }
}

function toComplaintMatch(match, extra = {}) {
  const out = {}
  if (match.createdAt) out.createdAt = match.createdAt
  // A project status would never match a complaint, so complaintStatus takes
  // precedence and a project-only status is simply not applied here.
  if (extra.complaintStatus) out.status = extra.complaintStatus
  else if (match.status && COMPLAINT_STATUSES.includes(match.status)) out.status = match.status
  if (match.department) out.assignedDepartment = String(match.department)
  if (extra.ward) out["location.ward"] = extra.ward
  return out
}

// Ward counts for any collection that stores location.ward directly.
function wardStage() {
  return [
    { $group: { _id: { $ifNull: ["$location.ward", "Unassigned"] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $project: { _id: 0, ward: "$_id", count: 1 } },
  ]
}

async function getSummary(query = {}) {
  const { error, match, extra } = buildFilters(query)
  if (error) return { error }

  const now = new Date()
  const complaintMatch = toComplaintMatch(match, extra)
  // Conflicts / notifications / audit carry no department or priority.
  const dateOnlyMatch = toDateOnlyMatch(match)
  const conflictMatch = dateOnlyMatch

  const [projectAgg, conflictAgg, complaintAgg, departmentAgg, userAgg, notificationAgg, auditAgg] = await Promise.all([
    Project.aggregate([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "n" }],
          byStatus: groupStage("status"),
          byPriority: groupStage("priority"),
          softDeleted: [{ $match: { isActive: false } }, { $count: "n" }],
          delayed: [
            {
              $match: {
                endDate: { $lt: now },
                status: { $nin: PROJECT_TERMINAL_STATUSES },
              },
            },
            { $count: "n" },
          ],
        },
      },
    ]),
    Conflict.aggregate([
      { $match: conflictMatch },
      { $facet: { total: [{ $count: "n" }], byStatus: groupStage("status"), bySeverity: groupStage("severity") } },
    ]),
    Complaint.aggregate([
      { $match: complaintMatch },
      { $facet: { total: [{ $count: "n" }], byStatus: groupStage("status") } },
    ]),
    Department.aggregate([
      { $facet: { total: [{ $count: "n" }], active: [{ $match: { isActive: true } }, { $count: "n" }] } },
    ]),
    User.aggregate([
      { $facet: { total: [{ $count: "n" }], byRole: groupStage("role"), active: [{ $match: { isActive: true } }, { $count: "n" }] } },
    ]),
    Notification.aggregate([
      { $match: dateOnlyMatch },
      {
        $facet: {
          total: [{ $count: "n" }],
          read: [{ $match: { read: true } }, { $count: "n" }],
          byType: groupStage("type"),
        },
      },
    ]),
    AuditLog.aggregate([
      { $match: dateOnlyMatch },
      {
        $facet: {
          total: [{ $count: "n" }],
          overrides: [{ $match: { isOverride: true } }, { $count: "n" }],
        },
      },
    ]),
  ])

  const p = projectAgg[0], c = conflictAgg[0], k = complaintAgg[0], d = departmentAgg[0], u = userAgg[0]
  const n = notificationAgg[0], a = auditAgg[0]
  const projectsByStatus = toBuckets(p.byStatus, PROJECT_STATUSES)
  const conflictsByStatus = toBuckets(c.byStatus, CONFLICT_STATUSES)
  const complaintsByStatus = toBuckets(k.byStatus, COMPLAINT_STATUSES)

  const notificationsTotal = firstCount(n.total)
  const notificationsRead = firstCount(n.read)

  return {
    projects: {
      total: firstCount(p.total),
      // Workflow state — NOT the soft-delete flag.
      active: projectsByStatus.active || 0,
      completed: projectsByStatus.completed || 0,
      // Derived: past its endDate and not in a terminal status. There is no
      // "delayed" status on the schema.
      delayed: firstCount(p.delayed),
      softDeleted: firstCount(p.softDeleted),
      byStatus: projectsByStatus,
      byPriority: toBuckets(p.byPriority, PROJECT_PRIORITIES),
    },
    conflicts: {
      total: firstCount(c.total),
      ...classifyConflicts(conflictsByStatus),
      byStatus: conflictsByStatus,
      bySeverity: toBuckets(c.bySeverity, CONFLICT_SEVERITIES),
    },
    complaints: {
      total: firstCount(k.total),
      ...classifyComplaints(complaintsByStatus),
      byStatus: complaintsByStatus,
    },
    departments: { total: firstCount(d.total), active: firstCount(d.active) },
    users: {
      total: firstCount(u.total),
      active: firstCount(u.active),
      byRole: toBuckets(u.byRole, USER_ROLES),
    },
    notifications: {
      total: notificationsTotal,
      read: notificationsRead,
      // Derived at query time; never persisted.
      unread: notificationsTotal - notificationsRead,
      byType: toBuckets(n.byType, []),
    },
    audit: {
      total: firstCount(a.total),
      overrides: firstCount(a.overrides),
    },
  }
}

// ── projects ──────────────────────────────────────────────────────────

async function getProjectAnalytics(query = {}) {
  const { error, match } = buildFilters(query)
  if (error) return { error }

  const [agg] = await Project.aggregate([
    { $match: match },
    {
      $facet: {
        total: [{ $count: "n" }],
        byStatus: groupStage("status"),
        byPriority: groupStage("priority"),
        byType: groupStage("projectType"),
        byWard: wardStage(),
        monthly: monthlyStage("createdAt"),
        // Elapsed calendar days from planned start to the date progress hit
        // 100 (actualEndDate is stamped by the progress endpoint).
        completion: [
          { $match: { actualEndDate: { $ne: null }, startDate: { $ne: null } } },
          {
            $group: {
              _id: null,
              avgDays: { $avg: { $divide: [{ $subtract: ["$actualEndDate", "$startDate"] }, 86400000] } },
              count: { $sum: 1 },
            },
          },
        ],
        byDepartment: [
          { $group: { _id: "$department", count: { $sum: 1 } } },
          { $lookup: { from: "departments", localField: "_id", foreignField: "_id", as: "dept" } },
          { $unwind: { path: "$dept", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              departmentId: "$_id",
              name: { $ifNull: ["$dept.name", "Unassigned"] },
              code: { $ifNull: ["$dept.code", null] },
              count: 1,
            },
          },
          { $sort: { count: -1 } },
        ],
        progress: [{ $group: { _id: null, avgProgress: { $avg: "$progress" }, avgMcdmScore: { $avg: "$mcdmScore" } } }],
      },
    },
  ])

  return {
    total: firstCount(agg.total),
    byStatus: toBuckets(agg.byStatus, PROJECT_STATUSES),
    byPriority: toBuckets(agg.byPriority, PROJECT_PRIORITIES),
    byType: toBuckets(agg.byType, PROJECT_TYPES),
    byDepartment: agg.byDepartment,
    byWard: agg.byWard,
    monthly: agg.monthly,
    averages: {
      progress: agg.progress[0] ? agg.progress[0].avgProgress : null,
      mcdmScore: agg.progress[0] ? agg.progress[0].avgMcdmScore : null,
      completionDays: agg.completion[0] ? agg.completion[0].avgDays : null,
      completedCount: agg.completion[0] ? agg.completion[0].count : 0,
    },
  }
}

async function getConflictAnalytics(query = {}) {
  const { error, match, extra } = buildFilters(query)
  if (error) return { error }

  const conflictMatch = {}
  if (match.createdAt) conflictMatch.createdAt = match.createdAt
  if (match.status && CONFLICT_STATUSES.includes(match.status)) conflictMatch.status = match.status

  const [agg] = await Conflict.aggregate([
    { $match: conflictMatch },
    {
      $facet: {
        total: [{ $count: "n" }],
        byStatus: groupStage("status"),
        bySeverity: groupStage("severity"),
        monthly: monthlyStage("createdAt"),
        recheckPassed: [{ $match: { recheckPassed: true } }, { $count: "n" }],
        // Conflicts carry no location of their own; the hotspot is the ward of
        // the first clashing project, joined here rather than in the client.
        byWard: [
          { $lookup: { from: "projects", localField: "project1", foreignField: "_id", as: "p" } },
          { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
          ...(extra.ward ? [{ $match: { "p.location.ward": extra.ward } }] : []),
          { $group: { _id: { $ifNull: ["$p.location.ward", "Unassigned"] }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, ward: "$_id", count: 1 } },
        ],
      },
    },
  ])

  const byStatus = toBuckets(agg.byStatus, CONFLICT_STATUSES)

  return {
    total: firstCount(agg.total),
    ...classifyConflicts(byStatus),
    byStatus,
    bySeverity: toBuckets(agg.bySeverity, CONFLICT_SEVERITIES),
    byWard: agg.byWard,
    monthly: agg.monthly,
    recheckPassed: firstCount(agg.recheckPassed),
  }
}

async function getComplaintAnalytics(query = {}) {
  const { error, match, extra } = buildFilters(query)
  if (error) return { error }

  const complaintMatch = toComplaintMatch(match, extra)

  const [agg] = await Complaint.aggregate([
    { $match: complaintMatch },
    {
      $facet: {
        total: [{ $count: "n" }],
        byStatus: groupStage("status"),
        byIssueType: groupStage("issueType"),
        byWard: wardStage(),
        // Complaint has no resolvedAt; updatedAt is the closest stored signal
        // for when a resolved complaint was last actioned.
        resolution: [
          { $match: { status: "resolved" } },
          {
            $group: {
              _id: null,
              avgDays: { $avg: { $divide: [{ $subtract: ["$updatedAt", "$createdAt"] }, 86400000] } },
              count: { $sum: 1 },
            },
          },
        ],
        monthly: monthlyStage("createdAt"),
        // Resolutions per month, keyed on updatedAt for the same reason
        // `resolution` above is: Complaint has no resolvedAt, and updatedAt is
        // the closest stored signal for when a resolved complaint was actioned.
        resolvedMonthly: [{ $match: { status: "resolved" } }, ...monthlyStage("updatedAt")],
        unassigned: [{ $match: { assignedOfficer: null } }, { $count: "n" }],
        byDepartment: [
          { $group: { _id: "$assignedDepartment", count: { $sum: 1 } } },
          // assignedDepartment is a String holding a Department _id, so it
          // must be converted before joining. onError/onNull keep malformed
          // or absent values in an "Unassigned" bucket instead of failing.
          {
            $addFields: {
              deptOid: { $convert: { input: "$_id", to: "objectId", onError: null, onNull: null } },
            },
          },
          { $lookup: { from: "departments", localField: "deptOid", foreignField: "_id", as: "dept" } },
          { $unwind: { path: "$dept", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              departmentId: "$_id",
              name: { $ifNull: ["$dept.name", "Unassigned"] },
              code: { $ifNull: ["$dept.code", null] },
              count: 1,
            },
          },
          { $sort: { count: -1 } },
        ],
      },
    },
  ])

  const byStatus = toBuckets(agg.byStatus, COMPLAINT_STATUSES)

  return {
    total: firstCount(agg.total),
    ...classifyComplaints(byStatus),
    unassigned: firstCount(agg.unassigned),
    byStatus,
    byIssueType: toBuckets(agg.byIssueType, COMPLAINT_ISSUE_TYPES),
    byDepartment: agg.byDepartment,
    byWard: agg.byWard,
    monthly: agg.monthly,
    resolvedMonthly: agg.resolvedMonthly,
    averages: {
      resolutionDays: agg.resolution[0] ? agg.resolution[0].avgDays : null,
      resolvedCount: agg.resolution[0] ? agg.resolution[0].count : 0,
    },
  }
}

async function getDepartmentAnalytics(query = {}) {
  const { error, match, extra } = buildFilters(query)
  if (error) return { error }

  const complaintMatch = toComplaintMatch(match, extra)

  // Three grouped reads, then a single in-memory merge over the number of
  // DEPARTMENTS (not documents) — so this is not an N+1.
  const [departments, projectRows, complaintRows] = await Promise.all([
    Department.find(match.department ? { _id: match.department } : {}).select("name code isActive").lean(),
    Project.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
          avgProgress: { $avg: "$progress" },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        },
      },
    ]),
    Complaint.aggregate([{ $match: complaintMatch }, { $group: { _id: "$assignedDepartment", count: { $sum: 1 } } }]),
  ])

  const projectsBy = new Map(projectRows.map((r) => [String(r._id), r]))
  const complaintsBy = new Map(complaintRows.map((r) => [String(r._id), r.count]))

  return {
    total: departments.length,
    active: departments.filter((d) => d.isActive).length,
    departments: departments
      .map((d) => ({
        _id: d._id,
        name: d.name,
        code: d.code,
        isActive: d.isActive,
        projects: projectsBy.get(String(d._id))?.count || 0,
        completed: projectsBy.get(String(d._id))?.completed || 0,
        avgProgress: projectsBy.get(String(d._id))?.avgProgress ?? null,
        complaints: complaintsBy.get(String(d._id)) || 0,
      }))
      .sort((a, b) => b.projects - a.projects),
  }
}

async function getActivityAnalytics(query = {}) {
  const { error, match } = buildFilters(query)
  if (error) return { error }

  const auditMatch = {}
  if (match.createdAt) auditMatch.createdAt = match.createdAt

  const limit = Math.min(parseInt(query.limit, 10) || 20, 100)

  const [agg, recent] = await Promise.all([
    AuditLog.aggregate([
      { $match: auditMatch },
      {
        $facet: {
          total: [{ $count: "n" }],
          byAction: groupStage("action"),
          byTargetType: groupStage("targetType"),
          overrides: [{ $match: { isOverride: true } }, { $count: "n" }],
          monthly: monthlyStage("createdAt"),
        },
      },
    ]),
    AuditLog.find(auditMatch)
      .populate("performedBy", "fullName role department")
      .sort("-createdAt")
      .limit(limit)
      .lean(),
  ])

  const a = agg[0]
  return {
    total: firstCount(a.total),
    overrides: firstCount(a.overrides),
    byAction: toBuckets(a.byAction, []),
    byTargetType: toBuckets(a.byTargetType, []),
    monthly: a.monthly,
    recent,
  }
}

module.exports = {
  getSummary,
  getProjectAnalytics,
  getConflictAnalytics,
  getComplaintAnalytics,
  getDepartmentAnalytics,
  getActivityAnalytics,
}
