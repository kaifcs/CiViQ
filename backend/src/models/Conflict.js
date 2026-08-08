// Detects a project collision. pairKey gives the unordered pair a unique identity.
// Resolution sides stay separate to preserve who decided what.

const mongoose = require("mongoose")

// Canonical key makes (A,B) and (B,A) identical for the unique index.
function canonicalPairKey(a, b) {
  return [String(a), String(b)].sort().join("_")
}

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
  // Whether clash detection passed after rescheduling.
  recheckPassed:   { type: Boolean },
  rescheduledProject: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
  // Derived from the project pair, never client-supplied.
  pairKey: { type: String, required: true },
}, { timestamps: true })

// Recompute the key from the project references before validation.
conflictSchema.pre("validate", function (next) {
  if (this.project1 && this.project2) {
    this.pairKey = canonicalPairKey(this.project1, this.project2)
  }
  next()
})

conflictSchema.statics.pairKeyFor = canonicalPairKey

// Database-level uniqueness prevents concurrent duplicate conflicts.
conflictSchema.index({ pairKey: 1 }, { unique: true })
// Supports per-project clash lookups.
conflictSchema.index({ project1: 1, project2: 1 })
conflictSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Conflict", conflictSchema)
module.exports.canonicalPairKey = canonicalPairKey