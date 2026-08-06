// MCDM Engine — 7 criteria scoring
const config = require("../config/staticConfig")
const Complaint = require("../models/Complaint")

async function calculateMCDM(projectData) {
  const scores = {}
  const w = config.mcdmWeights
  // Defaulted rather than dereferenced: an absent mcdmInputs or location used
  // to throw here, which the controller reported as a 500 even though a missing
  // location is a rejected request. Every read below already falls back to a
  // neutral value, so the engine now scores what it was given instead of
  // failing; the required-field check stays with the schema, where it belongs.
  const inputs = projectData.mcdmInputs || {}
  const location = projectData.location || {}
  const startMonth = new Date(projectData.startDate).getMonth() + 1

  // Criteria 1 — Condition Severity (26%)
  const conditionMap = { critical:10, poor:7, fair:4, good:2 }
  let c1 = conditionMap[inputs.conditionRating] || 5
  if (inputs.incidents?.includes("accidents")) c1 = Math.min(10, c1 + 2)
  // A project with no ward has no ward complaint history to weigh; skipping the
  // query is also what stops an absent value becoming an unfiltered count.
  const complaints = location.ward
    ? await Complaint.countDocuments({
        "location.ward": String(location.ward),
        createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
      })
    : 0
  if (complaints > 20) c1 = Math.min(10, c1 + 2)
  else if (complaints > 10) c1 = Math.min(10, c1 + 1)
  scores.conditionSeverity = c1

  // Criteria 2 — Population & Facility Impact (21%)
  // Reserved for future GIS integration.
  // The current repository does not contain an authoritative
  // population or facility dataset, so this criterion
  // defaults to a neutral score.
  scores.populationImpact = projectData.autoDetected?.populationScore || 5

  // Criteria 3 — Seasonal Compatibility (16%)
  const { monsoon, drySeason } = config.seasonal
  let c3
  if (["road","sewage"].includes(projectData.projectType)) {
    if (monsoon.includes(startMonth)) c3 = 1
    else if (drySeason.includes(startMonth)) c3 = 10
    else c3 = 6
  } else if (projectData.projectType === "parks") {
    c3 = monsoon.includes(startMonth) ? 10 : 4
  } else {
    c3 = 8 // underground work less affected by season
  }
  scores.seasonalCompatibility = c3

  // Criteria 4 — Execution Readiness (16%)
  const tenderMap = { "complete":8, "in_process":5, "planning":2 }
  let c4 = tenderMap[inputs.tenderStatus] || 5
  if (inputs.contractorAssigned) c4 = Math.min(10, c4 + 2)
  scores.executionReadiness = c4

  // Criteria 5 — Citizen Disruption (10%)
  const closureMap = { "full":2, "partial":6, "none":10 }
  let c5 = closureMap[inputs.roadClosure] || 6
  const utilCount = inputs.utilityDisruption?.length || 0
  if (utilCount >= 2) c5 = Math.max(1, c5 - 2)
  else if (utilCount === 1) c5 = Math.max(1, c5 - 1)
  if (inputs.disruptionDays > 30) c5 = Math.max(1, c5 - 2)
  scores.citizenDisruption = c5

  // Criteria 6 — Infrastructure Age (8%)
  const currentYear = new Date().getFullYear()
  const age = currentYear - (inputs.lastWorkYear || currentYear - 5)
  const lifecycle = config.lifecycle[projectData.projectType] || 10
  const ratio = age / lifecycle
  let c6 = ratio >= 1.5 ? 10 : ratio >= 1 ? 8 : ratio >= 0.5 ? 5 : 2
  scores.infrastructureAge = c6

  // Criteria 7 — Economic Value (3%)
  // Reserved for future economic analysis.
  // Requires municipal land-use / infrastructure metadata.
  scores.economicValue = projectData.autoDetected?.economicScore || 5

  // Final weighted score
  const total = (
    scores.conditionSeverity    * w.conditionSeverity    +
    scores.populationImpact     * w.populationImpact     +
    scores.seasonalCompatibility* w.seasonalCompatibility+
    scores.executionReadiness   * w.executionReadiness   +
    scores.citizenDisruption    * w.citizenDisruption    +
    scores.infrastructureAge    * w.infrastructureAge    +
    scores.economicValue        * w.economicValue
  )

  return {
    score:     Math.round(total * 10) / 10,
    breakdown: scores,
    outOf100:  Math.round(total * 10),
  }
}

module.exports = { calculateMCDM }
