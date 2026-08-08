// Policy configuration for clash detection and MCDM scoring.
module.exports = {
  // Supported municipal wards.
  wards: [
    "Ward 3",
    "Ward 5",
    "Ward 6",
    "Ward 8",
    "Ward 9",
    "Ward 12",
    "Ward 14",
    "Ward 18",
    "Ward 21",
  ],

  // Recovery period after project completion (days).
  bufferDays: {
    road:        14,
    water:       10,
    sewage:      10,
    electricity:  7,
    parks:        3,
    other:        7,
  },

  // Geographic buffer by project type (meters).
  geoBuffer: {
    road:        30,
    water:       15,
    sewage:      20,
    electricity: 10,
    parks:       10,
    other:       15,
  },

  // Additional buffer based on project size (meters).
  sizeBuffer: [
    { maxArea: 5000, extra: 0 },
    { maxArea: 20000, extra: 10 },
    { maxArea: 50000, extra: 20 },
    { maxArea: 100000, extra: 30 },
    { maxArea: Infinity, extra: 40 },
  ],

  // Compatibility between project types.
  conflictMatrix: {
    road:        { road: "incompatible", water: "incompatible", electricity: "conditional", sewage: "incompatible", parks: "conditional", other: "conditional" },
    water:       { road: "incompatible", water: "incompatible", electricity: "compatible", sewage: "incompatible", parks: "compatible", other: "conditional" },
    electricity: { road: "conditional", water: "compatible", electricity: "incompatible", sewage: "compatible", parks: "compatible", other: "conditional" },
    sewage:      { road: "incompatible", water: "incompatible", electricity: "compatible", sewage: "incompatible", parks: "compatible", other: "conditional" },
    parks:       { road: "conditional", water: "compatible", electricity: "compatible", sewage: "compatible", parks: "incompatible", other: "conditional" },
    other:       { road: "conditional", water: "conditional", electricity: "conditional", sewage: "conditional", parks: "conditional", other: "conditional" },
  },

  // Seasonal calendar.
  seasonal: {
    city: "Ghaziabad",
    monsoon: [6, 7, 8, 9],
    drySeason: [10, 11, 12, 1, 2, 3],
    preMonsoon: [4, 5],
  },

  // Expected infrastructure lifespan (years).
  lifecycle: {
    road:        10,
    water:       20,
    sewage:      15,
    electricity: 15,
    parks:        8,
    other:       10,
  },

  // MCDM criterion weights (must total 1.0).
  mcdmWeights: {
    conditionSeverity:     0.26,
    populationImpact:      0.21,
    seasonalCompatibility: 0.16,
    executionReadiness:    0.16,
    citizenDisruption:     0.10,
    infrastructureAge:     0.08,
    economicValue:         0.03,
  },
}