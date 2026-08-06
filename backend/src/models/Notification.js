const mongoose = require("mongoose")
const {
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_PRIORITY_VALUES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
} = require("../config/notificationTypes")

const notificationSchema = new mongoose.Schema({
  recipient:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:       { type: String, required: true, enum: NOTIFICATION_TYPE_VALUES },
  title:      { type: String, required: true },
  message:    { type: String, required: true },
  link:       { type: String },
  read:       { type: Boolean, default: false },
  data:       { type: Object },

  // Derived from `type` when the notification is created, so the list can be
  // filtered and sorted without every caller having to supply them.
  category:   { type: String, enum: NOTIFICATION_CATEGORY_VALUES, default: NOTIFICATION_CATEGORIES.SYSTEM },
  priority:   { type: String, enum: NOTIFICATION_PRIORITY_VALUES, default: NOTIFICATION_PRIORITIES.NORMAL },

  // Stamped when `read` flips to true; stays null while unread.
  readAt:     { type: Date, default: null },

  // Archive is the soft-delete for notifications: the record stays in history
  // but leaves the default feed. Explicit deletion removes the row outright.
  archived:   { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },

  // Email delivery state. The notification row doubles as the retry queue, so
  // no second collection or broker is involved.
  //   pending   — not yet attempted
  //   sending   — claimed by a worker; the claim is what prevents double sends
  //   delivered — accepted by the provider
  //   failed    — permanently rejected, or out of retries
  //   skipped   — email disabled, or suppressed by the user's preferences
  deliveryStatus: {
    type: String,
    enum: ["pending", "sending", "delivered", "failed", "skipped"],
    default: "pending",
  },
  deliveredAt:   { type: Date, default: null },
  retryCount:    { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: null },
  lastError:     { type: String, default: null },
}, { timestamps: true })

// The feed: one recipient's notifications, newest first, archived excluded.
notificationSchema.index({ recipient: 1, archived: 1, createdAt: -1 })
// The unread count and the unread filter.
notificationSchema.index({ recipient: 1, archived: 1, read: 1 })
// The retry sweep: rows due for another delivery attempt.
notificationSchema.index({ deliveryStatus: 1, nextAttemptAt: 1 })

module.exports = mongoose.model("Notification", notificationSchema)
