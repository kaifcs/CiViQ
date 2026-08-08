// Keeps Conflict documents and project clash state synchronized.
const Project = require("../models/Project")
const Conflict = require("../models/Conflict")
const { detectClashes } = require("./clashDetection")

// Atomic get-or-create; the unique pairKey index prevents concurrent duplicates.
async function findOrCreateConflict(projectId, clash) {
  const pairKey = Conflict.pairKeyFor(projectId, clash.projectId)

  const existing = await Conflict.findOne({ pairKey })
  if (existing) return { conflict: existing, created: false }

  try {
    const conflict = await Conflict.create({
      project1: projectId,
      project2: clash.projectId,
      clashTypes: clash.clashTypes,
      severity: clash.severity,
    })
    return { conflict, created: true }
  } catch (err) {
    if (err?.code !== 11000) throw err

    // Another request won the race; reuse its conflict.
    return {
      conflict: await Conflict.findOne({ pairKey }),
      created: false,
    }
  }
}

// Recomputes hasClash and clashes[] for affected projects.
async function syncClashState(projectIds = []) {
  const wanted = new Map()

  for (const id of projectIds) {
    if (id) wanted.set(String(id), id)
  }

  if (wanted.size === 0) return new Map()

  const ids = [...wanted.values()]

  const conflicts = await Conflict.find({
    $or: [{ project1: { $in: ids } }, { project2: { $in: ids } }],
  })
    .select("project1 project2")
    .lean()

  const byProject = new Map([...wanted.keys()].map((id) => [id, []]))

  for (const conflict of conflicts) {
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
    const { conflict, created: isNew } = await findOrCreateConflict(
      project._id,
      clash
    )

    if (isNew) created.push(clash)

    currentIds.push(conflict._id)
  }

  // Keep unrelated pending conflicts when rescheduling.
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

    for (const conflict of stale) {
      affected.push(conflict.project1, conflict.project2)
    }
  }

  const synced = await syncClashState(affected)

  project.clashes = synced.get(String(project._id)) || []
  project.hasClash = project.clashes.length > 0

  return { created, clashes }
}

module.exports = {
  syncClashState,
  reconcileProjectClashes,
  findOrCreateConflict,
}