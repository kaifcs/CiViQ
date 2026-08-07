// A detected collision between two projects, and the record of its resolution.
// The pair is unordered, so a lookup must test both orderings. The two
// resolution sides are stored apart so the trail shows who decided what.

const mongoose = require("mongoose")

const conflictSchema = new mongoose.Schema({
  project1:    { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  project2:    { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  clashTypes:  [{ type: String, enum: ["geographic","timeline","worktype"] }],
  severity:    { type: String, enum: ["incompatible","conditional"], default: "incompatible" },
  status: {
    type: String,
    enum: ["pending","resolved_both","resolved_rejected","awaiting_officer"],
    default: "pending"
  },
  adminResolution: {
    action:           { type: String, enum: ["approve_both","reject_lower"] },
    coordinationNote: { type: String },
    overrideCategory: { type: String },
    overrideReason:   { type: String },
    overrideRef:      { type: String },
    resolvedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt:       { type: Date },
  },
  officerResponse: {
    action:       { type: String, enum: ["accept","custom"] },
    customDate:   { type: Date },
    respondedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    respondedAt:  { type: Date },
  },
  suggestedDate:   { type: Date },
  // Whether clash detection came back clean after the reschedule.
  recheckPassed:   { type: Boolean },
  rescheduledProject: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
}, { timestamps: true })

// Pair lookup, to avoid stacking duplicate rows for one collision.
conflictSchema.index({ project1: 1, project2: 1 })
conflictSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Conflict", conflictSchema)
