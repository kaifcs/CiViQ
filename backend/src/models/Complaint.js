// A citizen-reported issue, tracked from submission to resolution.
//
// `cnrId` is the public reference a citizen quotes to track their report; it is
// generated below rather than supplied. The status enum is the whole lifecycle
// — there is no separate closed or rejected state, so "resolved" is terminal.
//
// Note: `assignedDepartment` is a String holding a Department id, not a ref, so
// it cannot be populated. The complaint analytics pipeline converts it to an
// ObjectId before joining; anything else resolving it must do the same.

const mongoose = require("mongoose")

const complaintSchema = new mongoose.Schema({
  cnrId:       { type: String, unique: true },
  issueType:   { type: String, enum: ["pothole","streetlight","water_leak","garbage","drainage","other"], required: true },
  description: { type: String, required: true },
  location: {
    address:    { type: String },
    ward:       { type: String },
    coords: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    }
  },
  photoUrl:    { type: String },
  status: {
    type: String,
    enum: ["submitted","acknowledged","in_progress","resolved"],
    default: "submitted"
  },
  assignedDepartment: { type: String },
  assignedOfficer:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolutionNote:     { type: String },
}, { timestamps: true })

// Sequence derived from a document count, so concurrent creates can collide on
// cnrId; the unique index is what ultimately rejects a duplicate.
complaintSchema.pre("save", async function(next) {
  if (!this.cnrId) {
    const count = await mongoose.model("Complaint").countDocuments()
    this.cnrId = "CNR-" + String(100000 + count + 1).padStart(6, "0")
  }
  next()
})

// Ward history feeds the MCDM condition score; the rest serve the filtered
// list views, each pairing its filter with the createdAt sort those views use.
complaintSchema.index({ "location.ward": 1, createdAt: 1 })
complaintSchema.index({ createdAt: -1 })
complaintSchema.index({ status: 1, createdAt: -1 })
complaintSchema.index({ assignedDepartment: 1, createdAt: -1 })
complaintSchema.index({ assignedOfficer: 1, createdAt: -1 })

module.exports = mongoose.model("Complaint", complaintSchema)
