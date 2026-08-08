// Keeps Conflict documents and each project's derived clash state synchronized.
const Project = require("../models/Project")
const Conflict = require("../models/Conflict")
const { detectClashes } = require("./clashDetection")

// Recomputes hasClash and clashes[] for affected projects.
async function syncClashState(projectIds = []) {
  // Preserve the caller's original ObjectId values for MongoDB filters.
  const wanted = new Map()

  for (const id of projectIds) if (id) wanted.set(String(id), id)

  if (wanted.size === 0) return new Map()

  const ids = [...wanted.values()]

  const conflicts = await Conflict.find({
    $or: [{ project1: { $in: ids } }, { project2: { $in: ids } }],
  })
    .select("project1 project2")
    .lean()

  const byProject = new Map([...wanted.keys()].map((id) => [id, []]))

  for (const conflict of conflicts) {
    // Update both projects participating in the conflict.
    for (const side of [conflict.project1, conflict.project2]) {
      byProject.get(String(side))?.push(conflict._id)
    }
  }

  await Project.bulkWrite(
    [...byProject].map(([id, clashes]) => ({
      updateOne: {
        filter: { _id: wanted.get(id) },
        update: { $set: { clashes, hasClash: clashes.length > 0 } },
      },
    }))
  )

  return byProject
}

// Reconciles persisted conflicts with the latest clash detection results.
async function reconcileProjectClashes(project, { pruneStale = true } = {}) {
  const clashes = await detectClashes(project)

  const currentIds = []
  const created = []

  for (const clash of clashes) {
    let conflict = await Conflict.findOne({
      $or: [
        { project1: project._id, project2: clash.projectId },
        { project1: clash.projectId, project2: project._id },
      ],
    })

    if (!conflict) {
      conflict = await Conflict.create({
        project1: project._id,
        project2: clash.projectId,
        clashTypes: clash.clashTypes,
        severity: clash.severity,
      })

      created.push(clash)
    }

    currentIds.push(conflict._id)
  }

  // Officer reschedules preserve unrelated pending conflicts.
  const stale = pruneStale
    ? await Conflict.find({
        status: "pending",
        _id: { $nin: currentIds },
        $or: [{ project1: project._id }, { project2: project._id }],
      })
        .select("project1 project2")
        .lean()
    : []

  const affected = [project._id, ...clashes.map((c) => c.projectId)]

  if (stale.length > 0) {
    await Conflict.deleteMany({
      _id: { $in: stale.map((c) => c._id) },
      status: "pending",
    })

    for (const c of stale) {
      affected.push(c.project1, c.project2)
    }
  }

  const synced = await syncClashState(affected)

  project.clashes = synced.get(String(project._id)) || []
  project.hasClash = project.clashes.length > 0

  return { created, clashes }
}

module.exports = { syncClashState, reconcileProjectClashes }