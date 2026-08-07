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

  // Derived from `type` at creation, so callers cannot classify inconsistently.
  category:   { type: String, enum: NOTIFICATION_CATEGORY_VALUES, default: NOTIFICATION_CATEGORIES.SYSTEM },
  priority:   { type: String, enum: NOTIFICATION_PRIORITY_VALUES, default: NOTIFICATION_PRIORITIES.NORMAL },

  readAt:     { type: Date, default: null },

  // Archive is the soft-delete: the record leaves the feed but stays in history.
  archived:   { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },

  // The row doubles as the email retry queue, so no broker is involved. The
  // `sending` claim is what prevents a double send across instances.
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

// The feed, the unread count, and the retry sweep respectively.
notificationSchema.index({ recipient: 1, archived: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, archived: 1, read: 1 })
notificationSchema.index({ deliveryStatus: 1, nextAttemptAt: 1 })

module.exports = mongoose.model("Notification", notificationSchema)
