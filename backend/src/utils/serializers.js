// Authorization-aware payload shaping. A conflict embeds two projects, so the
// ownership rule has to hold here too or the conflict payload becomes a way
// around it. `canAccessProject` remains the single definition of that rule.

const { canAccessProject } = require("../middleware/ownership")

// The reference survives so the conflict stays coherent: which projects clash
// is not the secret; their titles, scores and coordinates are.
function redactProjectRef(project, user) {
  if (!project || typeof project !== "object") return project
  if (canAccessProject(user, project)) return project
  return project._id
}

// Accepts a lean object or a hydrated document; always returns a plain object.
function serialiseConflict(conflict, user) {
  if (!conflict) return conflict
  const doc = conflict.toObject ? conflict.toObject() : { ...conflict }
  doc.project1 = redactProjectRef(doc.project1, user)
  doc.project2 = redactProjectRef(doc.project2, user)
  return doc
}

// The complaint reads are public, so this shaping — not a route guard — is what
// keeps internal workload and the reporter's whereabouts out of the public view.
function serialiseComplaint(complaint, user) {
  if (!complaint) return complaint
  const doc = complaint.toObject ? complaint.toObject() : { ...complaint }
  
  if (!user) {
    delete doc.assignedOfficer
    delete doc.assignedDepartment
    delete doc.photoUrl
    delete doc.resolutionNote
    
    if (doc.location) {
      // Ward survives, so the public aggregate views still work.
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

// Whitelist the fields exposed by the public project API.
function serialisePublicProject(project) {
  if (!project) return project
  const doc = project.toObject ? project.toObject() : project
  const dept = doc.department && typeof doc.department === "object" ? doc.department : null
  const loc = doc.location || {}
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    department: dept ? { code: dept.code, name: dept.name } : null,
    projectType: doc.projectType,
    status: doc.status,
    progress: doc.progress,
    startDate: doc.startDate,
    endDate: doc.endDate,
    actualEndDate: doc.actualEndDate || null,
    location: {
      ward: loc.ward || null,
      zone: loc.zone || null,
      address: loc.address || null,
      city: loc.city || null,
      state: loc.state || null,
      centerCoords: loc.centerCoords || null,
    },
  }
}

const serialisePublicProjects = (projects) => (projects || []).map(serialisePublicProject)

module.exports = {
  serialiseConflict, serialiseConflicts, redactProjectRef, serialiseComplaint, serialiseComplaints,
  serialisePublicProject, serialisePublicProjects,
}
