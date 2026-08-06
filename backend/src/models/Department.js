// A municipal department — the owning body for projects and complaints.
//
// `code` is the short form the UI labels and colours by, and `color` drives the
// department map layer, so both are presentation-affecting stored values rather
// than incidental metadata.
//
// Departments are deactivated, never deleted: existing projects reference them
// and history has to stay readable. `isActive` is what the reference validators
// check before allowing a new assignment.

const mongoose = require("mongoose")

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Department name is required"],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Department code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: "#000000",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

departmentSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Department", departmentSchema)
