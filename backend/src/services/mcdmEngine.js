// Calculates the weighted MCDM score for a project.
const config = require("../config/staticConfig")
const Complaint = require("../models/Complaint")

// No authoritative population or economic data exists in this deployment.
// Both criteria therefore use a neutral value and are treated as a stated
// limitation rather than measured data.
const NEUTRAL_SCORE = 5
const UNMEASURED_CRITERIA = ["populationImpact", "economicValue"]

async function calculateMCDM(projectData) {
  const scores = {}
  const w = config.mcdmWeights

  // Missing inputs default to neutral values.
  const inputs = projectData.mcdmInputs || {}
  const location = projectData.location || {}

  const startMonth = new Date(projectData.startDate).getMonth() + 1

  // Condition severity.
  const conditionMap = { critical: 10, poor: 7, fair: 4, good: 2 }

  let c1 = conditionMap[inputs.conditionRating] || 5

  if (inputs.incidents?.includes("accidents")) c1 = Math.min(10, c1 + 2)

  // Skip complaint lookup when no ward is available.
  const complaints = location.ward
    ? await Complaint.countDocuments({
        "location.ward": String(location.ward),
        createdAt: {
          $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        },
      })
    : 0

  if (complaints > 20) c1 = Math.min(10, c1 + 2)
  else if (complaints > 10) c1 = Math.min(10, c1 + 1)

  scores.conditionSeverity = c1

  // Population and facility impact — unmeasured, see NEUTRAL_SCORE.
  scores.populationImpact = NEUTRAL_SCORE

  // Seasonal compatibility.
  const { monsoon, drySeason } = config.seasonal

  let c3

  if (["road", "sewage"].includes(projectData.projectType)) {
    if (monsoon.includes(startMonth)) c3 = 1
    else if (drySeason.includes(startMonth)) c3 = 10
    else c3 = 6
  } else if (projectData.projectType === "parks") {
    c3 = monsoon.includes(startMonth) ? 10 : 4
  } else {
    c3 = 8
  }

  scores.seasonalCompatibility = c3

  // Execution readiness.
  const tenderMap = {
    complete: 8,
    in_process: 5,
    planning: 2,
  }

  let c4 = tenderMap[inputs.tenderStatus] || 5

  if (inputs.contractorAssigned) c4 = Math.min(10, c4 + 2)

  scores.executionReadiness = c4

  // Citizen disruption.
  const closureMap = {
    full: 2,
    partial: 6,
    none: 10,
  }

  let c5 = closureMap[inputs.roadClosure] || 6

  // Ignore the explicit "none" utility selection.
  const utilCount = (inputs.utilityDisruption || []).filter(
    (u) => u !== "none"
  ).length

  if (utilCount >= 2) c5 = Math.max(1, c5 - 2)
  else if (utilCount === 1) c5 = Math.max(1, c5 - 1)

  if (inputs.disruptionDays > 30) c5 = Math.max(1, c5 - 2)

  scores.citizenDisruption = c5

  // Infrastructure age.
  const currentYear = new Date().getFullYear()

  const age = currentYear - (inputs.lastWorkYear || currentYear - 5)

  const lifecycle = config.lifecycle[projectData.projectType] || 10

  const ratio = age / lifecycle

  const c6 =
    ratio >= 1.5 ? 10 :
    ratio >= 1 ? 8 :
    ratio >= 0.5 ? 5 : 2

  scores.infrastructureAge = c6

  // Economic value — unmeasured, see NEUTRAL_SCORE.
  scores.economicValue = NEUTRAL_SCORE

  const total =
    scores.conditionSeverity * w.conditionSeverity +
    scores.populationImpact * w.populationImpact +
    scores.seasonalCompatibility * w.seasonalCompatibility +
    scores.executionReadiness * w.executionReadiness +
    scores.citizenDisruption * w.citizenDisruption +
    scores.infrastructureAge * w.infrastructureAge +
    scores.economicValue * w.economicValue

  return {
    score: Math.round(total * 10) / 10,
    breakdown: scores,
    outOf100: Math.round(total * 10),
  }
}

module.exports = { calculateMCDM, NEUTRAL_SCORE, UNMEASURED_CRITERIA }