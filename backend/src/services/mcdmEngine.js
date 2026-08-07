// MCDM scoring: seven weighted criteria, each scored 1-10. The weights total
// 1.0, so `score` lands on the same 0-10 scale and `outOf100` is x10 of it.
const config = require("../config/staticConfig")
const Complaint = require("../models/Complaint")

async function calculateMCDM(projectData) {
  const scores = {}
  const w = config.mcdmWeights
  // Defaulted rather than dereferenced: every read below falls back to a
  // neutral value, and the required-field check belongs to the schema.
  const inputs = projectData.mcdmInputs || {}
  const location = projectData.location || {}
  const startMonth = new Date(projectData.startDate).getMonth() + 1

  // Condition severity (26%).
  const conditionMap = { critical:10, poor:7, fair:4, good:2 }
  let c1 = conditionMap[inputs.conditionRating] || 5
  if (inputs.incidents?.includes("accidents")) c1 = Math.min(10, c1 + 2)
  // Skipping the query also stops an absent ward becoming an unfiltered count.
  const complaints = location.ward
    ? await Complaint.countDocuments({
        "location.ward": String(location.ward),
        createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
      })
    : 0
  if (complaints > 20) c1 = Math.min(10, c1 + 2)
  else if (complaints > 10) c1 = Math.min(10, c1 + 1)
  scores.conditionSeverity = c1

  // Population and facility impact (21%). No authoritative dataset exists, so
  // this defaults to a neutral score.
  scores.populationImpact = projectData.autoDetected?.populationScore || 5

  // Seasonal compatibility (16%).
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

  // Execution readiness (16%).
  const tenderMap = { "complete":8, "in_process":5, "planning":2 }
  let c4 = tenderMap[inputs.tenderStatus] || 5
  if (inputs.contractorAssigned) c4 = Math.min(10, c4 + 2)
  scores.executionReadiness = c4

  // Citizen disruption (10%), inverted: less disruption scores higher.
  const closureMap = { "full":2, "partial":6, "none":10 }
  let c5 = closureMap[inputs.roadClosure] || 6
  const utilCount = inputs.utilityDisruption?.length || 0
  if (utilCount >= 2) c5 = Math.max(1, c5 - 2)
  else if (utilCount === 1) c5 = Math.max(1, c5 - 1)
  if (inputs.disruptionDays > 30) c5 = Math.max(1, c5 - 2)
  scores.citizenDisruption = c5

  // Infrastructure age (8%). The only criterion that reads the current year.
  const currentYear = new Date().getFullYear()
  const age = currentYear - (inputs.lastWorkYear || currentYear - 5)
  const lifecycle = config.lifecycle[projectData.projectType] || 10
  const ratio = age / lifecycle
  let c6 = ratio >= 1.5 ? 10 : ratio >= 1 ? 8 : ratio >= 0.5 ? 5 : 2
  scores.infrastructureAge = c6

  // Economic value (3%). Requires land-use metadata that does not exist yet.
  scores.economicValue = projectData.autoDetected?.economicScore || 5

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
