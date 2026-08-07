// Clash detection: a project collides with another when they overlap
// geographically, in time, and in incompatible work types. All three must hold.
const config = require("../config/staticConfig")
const Project = require("../models/Project")

function getGeoBuffer(projectType, area) {
  const base = config.geoBuffer[projectType] || 15
  const sizeBuffers = config.sizeBuffer
  const sizeEntry = sizeBuffers.find(s => area <= s.maxArea)
  const extra = sizeEntry ? sizeEntry.extra : 40
  return base + extra
}

// The widest buffer any two projects could combine to, so the cheap pre-filter
// can never exclude a real clash.
const MAX_PAIR_BUFFER_M =
  (Math.max(...Object.values(config.geoBuffer)) +
    Math.max(...config.sizeBuffer.map((s) => s.extra))) * 2

const METERS_PER_DEG_LAT = 111320

function boundingBox(lat, lng, meters) {
  const dLat = meters / METERS_PER_DEG_LAT
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dLng = meters / (METERS_PER_DEG_LAT * (Math.abs(cosLat) < 1e-6 ? 1e-6 : Math.abs(cosLat)))
  return {
    "location.centerCoords.lat": { $gte: lat - dLat, $lte: lat + dLat },
    "location.centerCoords.lng": { $gte: lng - dLng, $lte: lng + dLng },
  }
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000 // meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function hasTimeOverlap(start1, end1, start2, end2) {
  return new Date(start1) <= new Date(end2) && new Date(start2) <= new Date(end1)
}

function getWorkTypeConflict(type1, type2) {
  return config.conflictMatrix[type1]?.[type2] || "compatible"
}

async function detectClashes(newProject) {
  const clashes = []

  // Candidate selection: ward OR bounding box, a strict superset of possible
  // clashes. Exact distance is measured per candidate below.
  const coords = newProject.location?.centerCoords
  const orClauses = []

  if (newProject.location?.ward) {
    orClauses.push({ "location.ward": newProject.location.ward })
  }
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    orClauses.push(boundingBox(coords.lat, coords.lng, MAX_PAIR_BUFFER_M))
  }

  const candidateFilter = {
    status: { $in: ["pending","approved","active"] },
    _id: { $ne: newProject._id },
    isActive: { $ne: false },
  }
  if (orClauses.length > 0) candidateFilter.$or = orClauses

  // Only the fields the checks below read; candidates are never saved.
  const candidates = await Project.find(candidateFilter)
    .select("location projectType startDate endDate")
    .lean()

  for (const candidate of candidates) {
    // centerCoords is schema-required, so this only guards directly-inserted
    // documents that would otherwise throw in the distance call.
    if (!candidate.location?.centerCoords?.lat || !candidate.location?.centerCoords?.lng) continue
    const dist = haversineDistance(
      newProject.location.centerCoords.lat,
      newProject.location.centerCoords.lng,
      candidate.location.centerCoords.lat,
      candidate.location.centerCoords.lng
    )
    const buffer1 = getGeoBuffer(newProject.projectType, newProject.location.area || 0)
    const buffer2 = getGeoBuffer(candidate.projectType, candidate.location.area || 0)
    if (dist > buffer1 + buffer2) continue

    if (!hasTimeOverlap(newProject.startDate, newProject.endDate, candidate.startDate, candidate.endDate)) continue

    const conflict = getWorkTypeConflict(newProject.projectType, candidate.projectType)
    if (conflict === "compatible") continue

    clashes.push({
      projectId:  candidate._id,
      severity:   conflict,
      // Constant by construction: reaching here means all three matched.
      clashTypes: ["geographic","timeline","worktype"],
      distance:   Math.round(dist),
    })
  }

  return clashes
}

function getSuggestedStartDate(higherPriorityProject) {
  const endDate = new Date(higherPriorityProject.endDate)
  const bufferDays = config.bufferDays[higherPriorityProject.projectType] || 7
  const suggested = new Date(endDate)
  suggested.setDate(suggested.getDate() + bufferDays)
  return suggested
}

module.exports = { detectClashes, getSuggestedStartDate }
