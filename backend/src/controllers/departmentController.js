// Department administration. Reference data: the frontend caches the whole list
// at sign-in to resolve references. There is deliberately no delete.

const mongoose = require("mongoose")
const Department = require("../models/Department")
const { parsePagination, setPaginationHeaders } = require("../utils/pagination")
const { recordAudit } = require("../services/auditService")
const { ERROR_CODES, badRequest, fail, notFound } = require("../utils/apiResponse")

// Record only the fields supplied in the update.
const DEPARTMENT_WRITABLE_FIELDS = ["name", "code", "description", "color"]
const { logger } = require("../utils/logger")

// GET /api/departments
exports.getDepartments = async (req, res) => {
  try {
    const page = parsePagination(req.query)
    let q = Department.find().sort({ createdAt: -1 })
    if (page.enabled) q = q.skip(page.skip).limit(page.limit)

    const departments = await q.lean()
    if (page.enabled) setPaginationHeaders(res, await Department.countDocuments(), page)
    res.status(200).json({ success: true, count: departments.length, departments })
  } catch (err) {
    logger.error("Error getting departments", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error retrieving departments")
  }
}

// GET /api/departments/:id
exports.getDepartment = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid department ID")
    }

    const department = await Department.findById(req.params.id)

    if (!department) {
      return notFound(res, "Department not found", ERROR_CODES.DEPARTMENT_NOT_FOUND)
    }

    res.status(200).json({ success: true, department })
  } catch (err) {
    logger.error("Error getting department", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error retrieving department")
  }
}

// POST /api/departments
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description, color } = req.body

    if (!name || !code) {
      return badRequest(res, "Please provide a department name and code")
    }

    const department = await Department.create({
      name,
      code,
      description,
      color
    })

    await recordAudit({
      req,
      action: "department_created",
      targetType: "Department",
      targetId: department._id,
      details: { name: department.name, code: department.code },
    })

    res.status(201).json({ success: true, department })
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0]
      return badRequest(res, `A department with that ${field} already exists`)
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((val) => val.message)
      return badRequest(res, messages.join(", "))
    }
    logger.error("Error creating department", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error creating department")
  }
}

// PUT /api/departments/:id
exports.updateDepartment = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid department ID")
    }

    // isActive is not writable here; use PATCH /:id/status.
    const { name, code, description, color } = req.body

    let department = await Department.findById(req.params.id)

    if (!department) {
      return notFound(res, "Department not found", ERROR_CODES.DEPARTMENT_NOT_FOUND)
    }

    // Pre-checked so the response names the offending field; the 11000 catch
    // below is the backstop for races.
    if (name && name !== department.name) {
      const existingName = await Department.findOne({ name })
      if (existingName) {
        return badRequest(res, "A department with that name already exists")
      }
    }

    if (code && code !== department.code) {
      const existingCode = await Department.findOne({ code })
      if (existingCode) {
        return badRequest(res, "A department with that code already exists")
      }
    }

    department = await Department.findByIdAndUpdate(
      req.params.id,
      { name, code, description, color },
      { new: true, runValidators: true }
    )

    await recordAudit({
      req,
      action: "department_updated",
      targetType: "Department",
      targetId: department._id,
      details: { fields: DEPARTMENT_WRITABLE_FIELDS.filter((f) => req.body[f] !== undefined) },
    })

    res.status(200).json({ success: true, department })
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0]
      return badRequest(res, `A department with that ${field} already exists`)
    }
    logger.error("Error updating department", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error updating department")
  }
}

// PATCH /api/departments/:id/status
exports.updateDepartmentStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return badRequest(res, "Invalid department ID")
    }

    const { isActive } = req.body

    if (typeof isActive !== "boolean") {
      return badRequest(res, "Please provide a valid boolean isActive status")
    }

    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    )

    if (!department) {
      return notFound(res, "Department not found", ERROR_CODES.DEPARTMENT_NOT_FOUND)
    }

    await recordAudit({
      req,
      action: "department_status_updated",
      targetType: "Department",
      targetId: department._id,
      details: { isActive },
    })

    res.status(200).json({ success: true, department })
  } catch (err) {
    logger.error("Error updating department status", { error: err.message })
    fail(res, 500, ERROR_CODES.INTERNAL_ERROR, "Server error updating department status")
  }
}
