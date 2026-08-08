// A planned or in-progress municipal work — the central entity of the system.
// `status` is the workflow state; `isActive` is the separate soft-delete flag.
// `officer` owns the work and `supervisor` oversees it; both drive visibility.

const mongoose = require("mongoose")

const projectSchema = new mongoose.Schema({
  title:           { type: String, required: true },
  projectId:       { type: String, unique: true },
  department:      { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  projectType:     { type: String, enum: ["road","water","sewage","electricity","parks","other"], required: true },
  description:     { type: String, required: true },
  phase:           { type: String, enum: ["standalone","phase1","continuation"], default: "standalone" },
  parentProject:   { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  phaseNumber:     { type: Number, default: 1 },

  // Timeline
  startDate:       { type: Date, required: true },
  endDate:         { type: Date, required: true },
  actualEndDate:   { type: Date },

  // Budget
  estimatedCost:   { type: Number },
  budgetSource:    { type: String },
  tenderNumber:    { type: String },
  contractorName:  { type: String },
  contractorFirm:  { type: String },

  // Location
  location: {
    roadName:       { type: String },
    neighbourhood:  { type: String },
    ward:           { type: String },
    zone:           { type: String },
    city:           { type: String, default: "Ghaziabad" },
    state:          { type: String, default: "Uttar Pradesh" },
    address:        { type: String },
    // Validate coordinates at the schema level so create, update and seed paths
    // share the same bounds; clash detection relies on valid latitude/longitude.
    centerCoords: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    shape:          { type: String, enum: ["corridor","circle","rectangle","polygon"] },
    length:         { type: Number },
    width:          { type: Number },
    area:           { type: Number },
    buffer:         { type: Number },
    geoJSON:        { type: Object },
  },

  // MCDM
  mcdmScore:       { type: Number },
  mcdmBreakdown:   { type: Object },

  // MCDM Officer Inputs
  mcdmInputs: {
    conditionRating:    { type: String },
    incidents:          [{ type: String }],
    lastWorkYear:       { type: Number },
    tenderStatus:       { type: String },
    contractorAssigned: { type: Boolean },
    roadClosure:        { type: String },
    utilityDisruption:  [{ type: String }],
    disruptionDays:     { type: Number },
  },

  // Status
  status: {
    type: String,
    enum: ["pending","approved","rejected","active","completed","rescheduled"],
    default: "pending"
  },

  // Team
  officer:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // Admin
  adminNote:       { type: String },
  rejectionReason: { type: String },
  suggestedDate:   { type: Date },

  // Progress
  progress:        { type: Number, default: 0 },

  // Documents
  documents: [{
    name: String,
    url:  String,
    type: String,
  }],

  // Derived from the Conflict collection, which stays authoritative: `clashes`
  // is the rows referencing this project and `hasClash` is whether any exist.
  // Both sides of a pair are rewritten together by projectsController.
  hasClash:   { type: Boolean, default: false },
  clashes:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Conflict" }],

  priority: {
    type: String,
    enum: ["Low", "Medium", "High", "Critical"],
    default: "Medium",
  },
  projectManager: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  isActive: { type: Boolean, default: true },

}, { timestamps: true })

// Count-derived sequence, so concurrent creates can collide; the unique index
// is what ultimately rejects a duplicate.
projectSchema.pre("save", async function(next) {
  if (!this.projectId) {
    const count = await mongoose.model("Project").countDocuments()
    this.projectId = "PRJ-" + String(count + 1).padStart(4, "0")
  }
  next()
})

// The first two serve clash detection's ward-or-bounding-box candidate search;
// the ownership pairs serve the scoped, newest-first list views.
projectSchema.index({ "location.ward": 1, status: 1 })
projectSchema.index({ "location.centerCoords.lat": 1, "location.centerCoords.lng": 1 })
projectSchema.index({ officer: 1, createdAt: -1 })
projectSchema.index({ supervisor: 1, createdAt: -1 })
projectSchema.index({ createdAt: -1 })
projectSchema.index({ department: 1, createdAt: -1 })

module.exports = mongoose.model("Project", projectSchema)
