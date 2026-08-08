// A citizen-reported issue, tracked from submission to resolution.
// `cnrId` is the public tracking reference and is server-generated. `resolved`
// is terminal. `assignedDepartment` is a String, not a ref, so it needs $convert to join.

const mongoose = require("mongoose")

const complaintSchema = new mongoose.Schema({
  cnrId:       { type: String, unique: true },
  issueType:   { type: String, enum: ["pothole","streetlight","water_leak","garbage","drainage","other"], required: true },
  description: { type: String, required: true },
  location: {
    address:    { type: String },
    ward:       { type: String },
    coords: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
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

// Count-derived sequence, so concurrent creates can collide; the unique index
// is what ultimately rejects a duplicate.
complaintSchema.pre("save", async function(next) {
  if (!this.cnrId) {
    const count = await mongoose.model("Complaint").countDocuments()
    this.cnrId = "CNR-" + String(100000 + count + 1).padStart(6, "0")
  }
  next()
})

// Ward history feeds the MCDM condition score; the rest pair each list filter
// with the createdAt sort those views apply.
complaintSchema.index({ "location.ward": 1, createdAt: 1 })
complaintSchema.index({ createdAt: -1 })
complaintSchema.index({ status: 1, createdAt: -1 })
complaintSchema.index({ assignedDepartment: 1, createdAt: -1 })
complaintSchema.index({ assignedOfficer: 1, createdAt: -1 })

module.exports = mongoose.model("Complaint", complaintSchema)
