// Authorization-aware payload shaping.
//
// S2 closed direct access to projects outside a user's scope. A conflict
// embeds two projects, so the same rule has to hold there or the conflict
// payload becomes a way around it — the front door is locked but the window
// is open.
//
// The rule itself is not restated here: `canAccessProject` from the ownership
// middleware remains the single definition. This module only decides how an
// unauthorized reference is rendered.

const { canAccessProject } = require("../middleware/ownership")

/**
 * Collapses a populated project back to a bare id when the viewer is not
 * authorized to see it.
 *
 * The reference survives so the conflict itself is still coherent — which
 * projects clash is not the secret; their titles, departments, MCDM scores and
 * coordinates are. The frontend adapter already treats an unpopulated
 * reference as "details unavailable" and renders nulls, so no consumer breaks.
 */
function redactProjectRef(project, user) {
  if (!project || typeof project !== "object") return project
  if (canAccessProject(user, project)) return project
  return project._id
}

/**
 * Applies project visibility to one conflict. Accepts a lean object or a
 * hydrated document and always returns a plain object.
 */
function serialiseConflict(conflict, user) {
  if (!conflict) return conflict
  const doc = conflict.toObject ? conflict.toObject() : { ...conflict }
  doc.project1 = redactProjectRef(doc.project1, user)
  doc.project2 = redactProjectRef(doc.project2, user)
  return doc
}

/**
 * Redacts sensitive fields from a complaint if the viewer is unauthenticated.
 * Citizens can view the aggregate list and track their own issue's status by CNR ID,
 * but should not see internal workloads (assigned officer/dept) or exact location
 * details/photos (privacy).
 */
function serialiseComplaint(complaint, user) {
  if (!complaint) return complaint
  const doc = complaint.toObject ? complaint.toObject() : { ...complaint }
  
  if (!user) {
    delete doc.assignedOfficer
    delete doc.assignedDepartment
    delete doc.photoUrl
    delete doc.resolutionNote
    
    if (doc.location) {
      // Keep ward for aggregate dashboards, redact exact coordinates and street address
      delete doc.location.coords
      delete doc.location.address
    }
  }
  return doc
}

const serialiseConflicts = (conflicts, user) =>
  (conflicts || []).map((c) => serialiseConflict(c, user))

const serialiseComplaints = (complaints, user) =>
  (complaints || []).map((c) => serialiseComplaint(c, user))

module.exports = { serialiseConflict, serialiseConflicts, redactProjectRef, serialiseComplaint, serialiseComplaints }
