const mongoose = require("mongoose")
const service = require("../services/notificationService")
const stream = require("../services/notificationStream")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { issueTicket } = require("../utils/streamTicket")
const { ERROR_CODES, badRequest, notFound, serverError } = require("../utils/apiResponse")

// Bulk endpoints take client-supplied id arrays, so they need a ceiling.
const MAX_BULK_IDS = 200

// GET /api/notifications — bare array; pagination is opt-in.
exports.getNotifications = async (req, res) => {
  try {
    // `protect` already loaded the user, so preferences cost no extra query.
    const prefs = req.user.notificationPreferences
    const page = parsePagination(req.query)
    const notifications = await service.listNotifications(req.user._id, req.query, page, prefs)
    if (page.enabled) {
      setPaginationHeaders(res, await service.countNotifications(req.user._id, req.query, prefs), page)
    }
    res.json(notifications)
  } catch (err) { serverError(res, err, "notificationsController:") }
}

// Exchanges the caller's session JWT for a short-lived single-use ticket the
// EventSource can carry in its URL.
exports.issueStreamTicket = (req, res) => {
  res.json(issueTicket(req.user._id))
}

// Authentication is enforced by the route, so this only hands the socket to the hub.
exports.streamNotifications = (req, res) => {
  // No timeout, and Nagle disabled so each small frame leaves immediately.
  req.socket.setTimeout(0)
  req.socket.setNoDelay(true)
  req.socket.setKeepAlive(true)
  res.setTimeout?.(0)

  stream.addConnection(req.user._id, req, res)
}

// GET /api/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    res.json({ count: await service.getUnreadCount(req.user._id, req.user.notificationPreferences) })
  } catch (err) { serverError(res, err, "notificationsController:") }
}

// GET /api/notifications/preferences
exports.getPreferences = (req, res) => {
  res.json({ preferences: service.getPreferences(req.user) })
}

// PATCH /api/notifications/preferences
exports.updatePreferences = async (req, res) => {
  try {
    const preferences = await service.updatePreferences(
      req.user._id,
      req.body?.preferences ?? req.body,
      req.user.notificationPreferences
    )
    res.json({ preferences })
  } catch (err) { serverError(res, err, "notificationsController:") }
}

const archiveHandler = (archived) => async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid notification ID")
    }
    const result = await service.setArchived(req.user._id, [req.params.id], archived)
    if (result.updated === 0) return notFound(res, "Notification not found", ERROR_CODES.NOTIFICATION_NOT_FOUND)
    res.json(result)
  } catch (err) { serverError(res, err, "notificationsController:") }
}
exports.archiveOne = archiveHandler(true)
exports.unarchiveOne = archiveHandler(false)

function readBulkIds(req, res) {
  const ids = req.body?.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    badRequest(res, "Provide a non-empty ids array")
    return null
  }
  if (ids.length > MAX_BULK_IDS) {
    badRequest(res, `A maximum of ${MAX_BULK_IDS} ids may be sent per request`)
    return null
  }
  return ids
}

const bulkArchiveHandler = (archived) => async (req, res) => {
  try {
    const ids = readBulkIds(req, res)
    if (!ids) return
    res.json(await service.setArchived(req.user._id, ids, archived))
  } catch (err) { serverError(res, err, "notificationsController:") }
}
exports.bulkArchive = bulkArchiveHandler(true)
exports.bulkUnarchive = bulkArchiveHandler(false)

// DELETE /api/notifications/:id
exports.deleteOne = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid notification ID")
    }
    const result = await service.deleteNotifications(req.user._id, [req.params.id])
    if (result.deleted === 0) return notFound(res, "Notification not found", ERROR_CODES.NOTIFICATION_NOT_FOUND)
    res.json(result)
  } catch (err) { serverError(res, err, "notificationsController:") }
}

// DELETE /api/notifications/bulk-delete
exports.bulkDelete = async (req, res) => {
  try {
    const ids = readBulkIds(req, res)
    if (!ids) return
    res.json(await service.deleteNotifications(req.user._id, ids))
  } catch (err) { serverError(res, err, "notificationsController:") }
}

// GET /api/notifications/:id
exports.getNotification = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid notification ID")
    }
    const notification = await service.getNotification(req.user._id, req.params.id)
    // Reported as missing rather than forbidden, so ids cannot be probed.
    if (!notification) return notFound(res, "Notification not found", ERROR_CODES.NOTIFICATION_NOT_FOUND)
    res.json(notification)
  } catch (err) { serverError(res, err, "notificationsController:") }
}

// PATCH /api/notifications/:id/read
exports.markOneRead = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid notification ID")
    }
    const notification = await service.markRead(req.user._id, req.params.id)
    if (!notification) return notFound(res, "Notification not found", ERROR_CODES.NOTIFICATION_NOT_FOUND)
    res.json(notification)
  } catch (err) { serverError(res, err, "notificationsController:") }
}

// PATCH /api/notifications/read-all
exports.markRead = async (req, res) => {
  try {
    // Clears exactly the set the badge counts.
    const updated = await service.markAllRead(req.user._id, req.user.notificationPreferences)
    res.json({ message: "All marked as read", updated })
  } catch (err) { serverError(res, err, "notificationsController:") }
}
