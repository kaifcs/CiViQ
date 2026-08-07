// Accounts for every role: admin, officer, supervisor and citizen.
// The password hash is withheld by three independent layers, so no single
// mistake exposes it. `department` is a String, not a ref, so it cannot be populated.

const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ["admin", "officer", "supervisor", "citizen"],
      required: true,
    },
    department: {
      type: String,
      trim: true,
    },
    phone: { type: String, trim: true },
    avatar: { type: String },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },

    // Embedded so `protect` already holds them on every authenticated request.
    // Absent or partial values read as opted in.
    notificationPreferences: {
      type: Object,
      default: undefined,
    },
  },
  { timestamps: true }
)

// Guarded by isModified so an unrelated save cannot re-hash an existing hash.
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

// Requires the document to have been loaded with .select("+password").
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password)
}

// Last line of defence: serialising a whole user document cannot leak the hash.
userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  delete obj.__v
  return obj
}

userSchema.index({ createdAt: -1 })

module.exports = mongoose.model("User", userSchema)
