// A municipal department — the owning body for projects and complaints.
// Deactivated, never deleted: existing projects reference them and history must
// stay readable. `isActive` is what the reference validators check.

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
