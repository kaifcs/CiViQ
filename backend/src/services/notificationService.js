// Central notification service for creating, delivering and reading notifications.
// Business modules use the notify* helpers instead of accessing notifications directly.

const mongoose = require("mongoose")
const Notification = require("../models/Notification")
const User = require("../models/User")
const {
  NOTIFICATION_TYPES, NOTIFICATION_CATEGORY_VALUES, metadataForType,
} = require("../config/notificationTypes")
const { NOTIFICATION_LINK_KINDS, linkFor } = require("../config/notificationLinks")
const { sendEmail, isEnabled: emailEnabled } = require("./emailService")
const { renderNotificationEmail } = require("./emailTemplates")
const stream = require("./notificationStream")
const { logger } = require("../utils/logger")
const {
  shouldSendEmail, shouldSendRealtime, visibleCategories,
  sanitisePreferences, defaultPreferences,
} = require("./notificationPreferences")

// Category and priority are stamped here rather than by callers, so every
// notification of a given type is classified identically.
function withDerivedMetadata(payload) {
  const { category, priority } = metadataForType(payload.type)
  return { category, priority, ...payload }
}

// Producers name a destination because the path depends on the recipient's role.
// Roles are read in one query per batch. An explicit `link` is honoured as given.
async function resolveLinks(payloads) {
  const needing = payloads.filter((p) => p.link === undefined && p.linkTo)

  let roleById = new Map()
  if (needing.length > 0) {
    const ids = [...new Set(needing.map((p) => String(p.recipient)))]
    const users = await User.find({ _id: { $in: ids } }).select("role").lean()
    roleById = new Map(users.map((u) => [String(u._id), u.role]))
  }

  return payloads.map(({ linkTo, ...payload }) => {
    if (payload.link !== undefined || !linkTo) return payload
    const link = linkFor(roleById.get(String(payload.recipient)), linkTo)
    // Left absent rather than set to a path the recipient's router would refuse.
    return link === undefined ? payload : { ...payload, link }
  })
}

// Resolves the recipient once and drives both channels from it, so preference
// evaluation costs no extra query.
async function deliver(notification) {
  const doc = notification.toObject ? notification.toObject() : notification
  const user = await User.findById(doc.recipient)
    .select("email fullName isActive notificationPreferences")
    .lean()
  if (!user) return

  if (shouldSendRealtime(doc, user)) {
    publish(doc.recipient, "notification.created", doc, String(doc._id))
  }

  await deliverEmail(doc, user)
}

// Notification documents act as the email delivery queue.

const MAX_EMAIL_ATTEMPTS = 4
// Exponential-ish backoff per attempt, in milliseconds.
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000]

// Marks a notification as never-to-be-emailed, without consuming an attempt.
async function markSkipped(id, reason) {
  await Notification.updateOne(
    { _id: id, deliveryStatus: { $in: ["pending", "sending"] } },
    { deliveryStatus: "skipped", lastError: reason, nextAttemptAt: null }
  )
}

// The status guard is the idempotency mechanism: exactly one caller can move a
// row out of `pending`, so concurrent sweeps cannot produce a duplicate send.
async function claimForSend(id) {
  return Notification.findOneAndUpdate(
    { _id: id, deliveryStatus: "pending" },
    { deliveryStatus: "sending" },
    { new: true }
  ).lean()
}

// Preferences are evaluated here, not by the caller, so a retry honours an
// opt-out made after the notification was created.
async function deliverEmail(doc, user) {
  if (!emailEnabled()) {
    await markSkipped(doc._id, "email_not_configured")
    return { skipped: true }
  }
  if (!shouldSendEmail(doc, user)) {
    await markSkipped(doc._id, "suppressed_by_preferences")
    return { skipped: true }
  }

  const claimed = await claimForSend(doc._id)
  // Someone else already has it, or it has already reached a terminal state.
  if (!claimed) return { skipped: true, reason: "not_claimable" }

  try {
    const { subject, html, text } = renderNotificationEmail(doc)
    await sendEmail({ to: user.email, toName: user.fullName, subject, html, text })
    await Notification.updateOne(
      { _id: doc._id },
      { deliveryStatus: "delivered", deliveredAt: new Date(), nextAttemptAt: null, lastError: null }
    )
    return { delivered: true }
  } catch (err) {
    const attempts = (claimed.retryCount || 0) + 1
    const canRetry = err.retryable !== false && attempts < MAX_EMAIL_ATTEMPTS
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]

    await Notification.updateOne({ _id: doc._id }, {
      // Back to pending so the sweep can claim it again; failed is terminal.
      deliveryStatus: canRetry ? "pending" : "failed",
      retryCount: attempts,
      nextAttemptAt: canRetry ? new Date(Date.now() + delay) : null,
      lastError: err.message?.slice(0, 300) || "unknown error",
    })

    if (!canRetry) {
      logger.error(`Email permanently failed for notification "${doc._id}": ${err.message}`)
    }
    return { delivered: false, willRetry: canRetry }
  }
}

// Re-reads the recipient so preferences and account state are current on retry.
async function retryEmail(notificationId) {
  const doc = await Notification.findById(notificationId).lean()
  if (!doc || doc.deliveryStatus !== "pending") return { skipped: true }

  const user = await User.findById(doc.recipient)
    .select("email fullName isActive notificationPreferences")
    .lean()
  if (!user) {
    await markSkipped(doc._id, "recipient_no_longer_exists")
    return { skipped: true }
  }
  return deliverEmail(doc, user)
}

// Notifications whose next attempt is due.
async function dueForRetry(limit = 25) {
  return Notification.find({
    deliveryStatus: "pending",
    nextAttemptAt: { $ne: null, $lte: new Date() },
  }).sort({ nextAttemptAt: 1 }).limit(limit).select("_id").lean()
}

// Fire-and-forget: a business operation must not wait on delivery, and a
// delivery failure must never surface as a failed request.
function queueDelivery(notification) {
  if (!notification) return
  Promise.resolve()
    .then(() => deliver(notification))
    .catch((err) => {
      logger.error(`Notification delivery failed for "${notification._id}"`, { error: err.message })
    })
}

// Events reuse the stored document, or an id list for bulk operations. A
// publish failure never reaches the caller.
function publish(recipientId, event, payload, id) {
  try {
    return stream.publish(recipientId, event, payload, id)
  } catch (err) {
    logger.error(`Realtime publish failed for "${event}"`, { error: err.message })
    return 0
  }
}

// Skips notifications sent to the actor when a producer provides one.
// The actor is not stored; notifications only record the recipient.
//
// Producers opt in because some events, such as clash detection, should
// still notify the actor.
function dropSelfDirected(payloads) {
  return payloads
    .map(({ actor, ...payload }) =>
      actor && String(actor) === String(payload.recipient) ? null : payload
    )
    .filter(Boolean)
}

async function createNotification({ recipient, type, title, message, link, data, linkTo, actor }) {
  const wanted = dropSelfDirected([{ recipient, type, title, message, link, data, linkTo, actor }])
  // The whole notification was self-directed; nothing to persist or deliver.
  if (wanted.length === 0) return null

  const [resolved] = await resolveLinks(wanted)
  const notification = await Notification.create(withDerivedMetadata(resolved))
  queueDelivery(notification)
  return notification
}

async function createNotifications(payloads) {
  if (!Array.isArray(payloads) || payloads.length === 0) return []
  const wanted = dropSelfDirected(payloads)
  if (wanted.length === 0) return []

  const resolved = await resolveLinks(wanted)
  const created = await Notification.insertMany(resolved.map(withDerivedMetadata))
  for (const notification of created) queueDelivery(notification)
  return created
}

function buildClashDetectedPayload(officer, project, clashWith) {
  return {
    recipient: officer,
    type: "clash_detected",
    title: "Clash Detected",
    message: `Your project "${project.title}" has a clash with "${clashWith.title}". Admin will review.`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.CONFLICTS },
    data: { projectId: project._id }
  }
}

async function notifyClashDetected(officer, project, clashWith) {
  return createNotification(buildClashDetectedPayload(officer, project, clashWith))
}

async function notifyProjectApproved(officer, project) {
  return createNotification({
    recipient: officer,
    type: "project_approved",
    title: "Project Approved",
    message: `Your project "${project.title}" has been approved and is now active.`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.PROJECT, id: project._id },
    data: { projectId: project._id }
  })
}

// Omit the date when suggestedDate is unavailable.
async function notifyProjectRejected(officer, project, suggestedDate) {
  const parsed = suggestedDate == null ? null : new Date(suggestedDate)
  const suggested = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null

  return createNotification({
    recipient: officer,
    type: "project_rejected",
    title: "Project Rescheduled",
    message: suggested
      ? `Your project "${project.title}" has been rescheduled. Suggested start: ${suggested.toLocaleDateString()}.`
      : `Your project "${project.title}" has been rescheduled. Open it for the reason and next steps.`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.PROJECT, id: project._id },
    data: { projectId: project._id, suggestedDate }
  })
}

async function notifyEarlyCompletion(nextProjectOfficer, completedProject, availableDate) {
  return createNotification({
    recipient: nextProjectOfficer,
    type: "early_completion",
    title: "Project Slot Available Earlier",
    message: `"${completedProject.title}" completed early. You can now start from ${new Date(availableDate).toLocaleDateString()}.`,
    data: { availableDate }
  })
}

// `actor` is the user performing the assignment: an officer who assigns a
// complaint to themselves already knows, so they are not notified.
async function notifyComplaintAssigned(officer, complaint, actor) {
  return createNotification({
    recipient: officer,
    actor,
    type: "complaint_assigned",
    title: "Complaint Assigned",
    message: `Complaint ${complaint.cnrId} (${complaint.issueType}) has been assigned to you.`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.COMPLAINT, id: complaint._id },
    data: { complaintId: complaint._id, cnrId: complaint.cnrId },
  })
}

async function notifyProjectAssigned(supervisor, project) {
  return createNotification({
    recipient: supervisor,
    type: NOTIFICATION_TYPES.PROJECT_ASSIGNED,
    title: "Project Assigned",
    message: `You have been assigned to supervise "${project.title}".`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.PROJECT, id: project._id },
    data: { projectId: project._id },
  })
}

async function notifyProjectCompleted(recipient, project) {
  return createNotification({
    recipient,
    type: NOTIFICATION_TYPES.PROJECT_COMPLETED,
    title: "Project Completed",
    message: `"${project.title}" has reached 100% progress and is marked completed.`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.PROJECT, id: project._id },
    data: { projectId: project._id },
  })
}

async function notifyRoleChanged(user, role) {
  return createNotification({
    recipient: user,
    type: NOTIFICATION_TYPES.ROLE_CHANGED,
    title: "Role Updated",
    message: `Your role has been changed to "${role}". Sign in again if your access looks different.`,
    data: { role },
  })
}

// `actor` is the user changing the status — usually the assigned officer
// working their own queue, who must not be notified of their own click.
async function notifyComplaintStatusChanged(officer, complaint, actor) {
  return createNotification({
    recipient: officer,
    actor,
    type: "complaint_status_changed",
    title: "Complaint Status Updated",
    message: `Complaint ${complaint.cnrId} is now "${complaint.status}".`,
    linkTo: { kind: NOTIFICATION_LINK_KINDS.COMPLAINT, id: complaint._id },
    data: { complaintId: complaint._id, cnrId: complaint.cnrId, status: complaint.status },
  })
}

// Same contract as recordAudit: a notification write must never fail the
// business operation that triggered it, so a controller can await one of these
// after its write without guarding it.
function dispatcher(fn, label) {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      logger.error(`Notification write failed for "${label}"`, { error: err.message })
      return null
    }
  }
}

// Every read is scoped to the recipient, so ownership is enforced by the filter
// itself rather than by a separate check that could be forgotten.

const SORT_FIELDS = ["createdAt", "priority", "read"]

// Escapes user input before it reaches a regular expression.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// The recipient-scoped filter shared by list, count and detail. Muted
// categories are hidden by default but never deleted; ?includeMuted or an
// explicit ?category still returns the history.
function buildFilter(recipientId, query = {}, preferences) {
  const { read, type, category, priority, archived, search, includeMuted } = query
  const filter = { recipient: recipientId }

  // Default feed excludes archived notifications.
  // Use `archived: false` instead of `$ne: true` to keep the
  // { recipient, archived, createdAt } index usable for sorting.
  if (archived === "true" || archived === true) {
    filter.archived = true
  } else if (archived === "all") {
    // include archived and non-archived
  } else {
    filter.archived = false
  }

  if (read === "true" || read === true) filter.read = true
  if (read === "false" || read === false) filter.read = false
  if (type) filter.type = String(type)
  if (priority) filter.priority = String(priority)

  if (category) {
    filter.category = String(category)
  } else if (preferences && includeMuted !== "true" && includeMuted !== true) {
    const allowed = visibleCategories(preferences)
    if (allowed.length === 0) filter.category = { $in: [] }
    // Skip the filter when all categories are allowed.
    else if (allowed.length < NOTIFICATION_CATEGORY_VALUES.length) {
      filter.category = { $in: allowed }
    }
  }

  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), "i")
    filter.$or = [{ title: rx }, { message: rx }]
  }

  return filter
}

// Whitelisted sort, defaulting to newest first.
function buildSort(query = {}) {
  const field = SORT_FIELDS.includes(query.sortBy) ? query.sortBy : "createdAt"
  const dir = query.order === "asc" ? 1 : -1
  return { [field]: dir }
}

async function listNotifications(recipientId, query = {}, page = { enabled: false }, preferences) {
  const filter = buildFilter(recipientId, query, preferences)
  let q = Notification.find(filter).sort(buildSort(query))
  // Without explicit pagination the feed stays capped, as it always has been.
  if (page.enabled) q = q.skip(page.skip).limit(page.limit)
  else q = q.limit(50)
  return q.lean()
}

async function countNotifications(recipientId, query = {}, preferences) {
  return Notification.countDocuments(buildFilter(recipientId, query, preferences))
}

// The badge counts exactly what the list would show, so the two cannot disagree.
async function getUnreadCount(recipientId, preferences) {
  return Notification.countDocuments(
    buildFilter(recipientId, { read: "false" }, preferences)
  )
}

async function getNotification(recipientId, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  return Notification.findOne({ _id: id, recipient: recipientId }).lean()
}

async function markRead(recipientId, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  const updated = await Notification.findOneAndUpdate(
    { _id: id, recipient: recipientId },
    { read: true, readAt: new Date() },
    { new: true }
  ).lean()
  // Announced so the user's other tabs converge on the same read state.
  if (updated) publish(recipientId, "notification.read", updated, String(updated._id))
  return updated
}

// Scoped through buildFilter so this clears exactly the set the badge counts,
// leaving archived rows and muted categories untouched.
async function markAllRead(recipientId, preferences) {
  const result = await Notification.updateMany(
    buildFilter(recipientId, { read: "false" }, preferences),
    { read: true, readAt: new Date() }
  )
  const updated = result.modifiedCount || 0
  if (updated > 0) publish(recipientId, "notification.read_all", { updated })
  return updated
}

// Archive is reversible and keeps history; delete is final. Both announce the
// ids they touched, so open clients converge without re-reading the list.

function validIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map(String)
}

// Returns the ids that changed, so callers report an accurate count.
async function setArchived(recipientId, ids, archived) {
  const wanted = validIds(ids)
  if (wanted.length === 0) return { ids: [], updated: 0 }

  // Read first, so the event carries only rows that changed and ids belonging
  // to another user are silently excluded.
  const matching = await Notification.find(
    { _id: { $in: wanted }, recipient: recipientId, archived: { $ne: archived } }
  ).select("_id").lean()

  const changed = matching.map((n) => String(n._id))
  if (changed.length === 0) return { ids: [], updated: 0 }

  await Notification.updateMany(
    { _id: { $in: changed }, recipient: recipientId },
    { archived, archivedAt: archived ? new Date() : null }
  )

  publish(recipientId, archived ? "notification.archived" : "notification.unarchived", { ids: changed })
  return { ids: changed, updated: changed.length }
}

// Permanently removes notifications the recipient owns.
async function deleteNotifications(recipientId, ids) {
  const wanted = validIds(ids)
  if (wanted.length === 0) return { ids: [], deleted: 0 }

  const matching = await Notification.find(
    { _id: { $in: wanted }, recipient: recipientId }
  ).select("_id").lean()

  const owned = matching.map((n) => String(n._id))
  if (owned.length === 0) return { ids: [], deleted: 0 }

  await Notification.deleteMany({ _id: { $in: owned }, recipient: recipientId })
  publish(recipientId, "notification.deleted", { ids: owned })
  return { ids: owned, deleted: owned.length }
}

// Current preferences, filled in with the defaults for anything unset.
function getPreferences(user) {
  return sanitisePreferences({}, user?.notificationPreferences)
}

// Announced so a user's other tabs pick the change up without polling.
async function updatePreferences(recipientId, patch, current) {
  const next = sanitisePreferences(patch, current)
  await User.updateOne({ _id: recipientId }, { notificationPreferences: next })
  publish(recipientId, "notification.preferences_updated", { preferences: next })
  return next
}

module.exports = {
  NOTIFICATION_TYPES,
  // Unwrapped: these have no controller caller on a completed-write path, so
  // swallowing here would hide failures rather than protect anything.
  createNotification,
  buildClashDetectedPayload,
  notifyClashDetected,
  notifyEarlyCompletion,

  // Isolated: each is awaited by a controller after its business write.
  createNotifications: dispatcher(createNotifications, "batch"),
  notifyProjectApproved: dispatcher(notifyProjectApproved, "project_approved"),
  notifyProjectRejected: dispatcher(notifyProjectRejected, "project_rejected"),
  notifyProjectAssigned: dispatcher(notifyProjectAssigned, "project_assigned"),
  notifyProjectCompleted: dispatcher(notifyProjectCompleted, "project_completed"),
  notifyComplaintAssigned: dispatcher(notifyComplaintAssigned, "complaint_assigned"),
  notifyComplaintStatusChanged: dispatcher(notifyComplaintStatusChanged, "complaint_status_changed"),
  notifyRoleChanged: dispatcher(notifyRoleChanged, "role_changed"),
  listNotifications,
  countNotifications,
  getUnreadCount,
  getNotification,
  markRead,
  markAllRead,
  setArchived,
  deleteNotifications,
  getPreferences,
  updatePreferences,
  defaultPreferences,
  retryEmail,
  dueForRetry,
  MAX_EMAIL_ATTEMPTS,
}
