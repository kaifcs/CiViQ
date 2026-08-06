// Accounts for every role: admin, officer, supervisor and citizen.
//
// The password never leaves this model in readable form. Three layers enforce
// that: `select: false` keeps it out of queries by default, the pre-save hook
// hashes it, and toJSON strips it from anything serialised. `protect` also
// excludes it explicitly, so no single mistake exposes a hash.
//
// Note: `department` is a plain String, not a ref to Department. Population is
// therefore not available on this field — code that needs department details
// resolves the id through a lookup index instead (see the frontend adapters and
// the $convert in the complaint analytics pipeline).

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

    // Per-channel, per-category notification opt-outs. Embedded rather than a
    // separate collection so `protect` already has them in memory on every
    // authenticated request. Absent or partial values read as opted in, so
    // existing accounts keep receiving everything.
    notificationPreferences: {
      type: Object,
      default: undefined,
    },
  },
  { timestamps: true }
)

// Guarded by isModified so re-saving a user for any other reason does not
// re-hash an already-hashed password into an unusable value.
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

/** Compares a plaintext attempt against the stored hash. Requires the document
 *  to have been loaded with .select("+password"). */
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password)
}

// Last line of defence: even a handler that serialises a whole user document
// cannot leak the hash.
userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  delete obj.__v
  return obj
}

userSchema.index({ createdAt: -1 })

module.exports = mongoose.model("User", userSchema)
