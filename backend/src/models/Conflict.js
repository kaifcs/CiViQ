// A detected collision between two projects, and the record of its resolution.
//
// Created by services/clashDetection when two works overlap geographically,
// in time, and in incompatible work types. The pair is unordered — project1 and
// project2 carry no precedence — so callers searching for an existing conflict
// must test both orderings.
//
// Resolution is two-sided and each side is stored separately: an administrator
// decides (adminResolution), and where that requires the owning officer to move
// their dates, the officer answers (officerResponse). Keeping them apart is
// what lets the trail show who decided what, rather than a single overwritten
// outcome.
//
// Severity mirrors the configured conflict matrix: "incompatible" works cannot
// coexist, "conditional" ones can with coordination.

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
  // Whether re-running clash detection after the reschedule came back clean.
  recheckPassed:   { type: Boolean },
  rescheduledProject: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
}, { timestamps: true })

// Finding whether a given pair already has a conflict, before creating another.
conflictSchema.index({ project1: 1, project2: 1 })
conflictSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Conflict", conflictSchema)
