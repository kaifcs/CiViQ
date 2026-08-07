
const mongoose = require("mongoose")

const auditSchema = new mongoose.Schema({
  action:     { type: String, required: true },
  performedBy:{ type: mongoose.Schema.Types.ObjectId, ref: "User" },
  targetType: { type: String },
  targetId:   { type: mongoose.Schema.Types.ObjectId },
  details:    { type: Object },
  isOverride: { type: Boolean, default: false },
  ipAddress:  { type: String },
}, { timestamps: true })

// Newest-first default view, and the actor filter.
auditSchema.index({ createdAt: -1 })
auditSchema.index({ performedBy: 1, createdAt: -1 })

module.exports = mongoose.model("AuditLog", auditSchema)
