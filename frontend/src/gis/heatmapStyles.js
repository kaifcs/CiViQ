// Configuration and weighting for the density layer.
//
// WEIGHTING: only fields the backend actually stores contribute. Projects carry
// Project.priority, which maps to a real intensity. Complaints have no
// severity, priority or urgency field, so every complaint counts as one — the
// heatmap shows where complaints are dense, not how bad they are.
//
// RENDER ORDER: leaflet.heat pins its canvas to Leaflet's overlayPane (z-index
// 400), which sits below every civiq-* pane in config.js (410-450). The density
// surface therefore always draws beneath markers and vectors, with no pane
// wiring of its own.

export const HEATMAP_SOURCES = {
  complaints: "Complaints",
  projects: "Projects",
}
export const HEATMAP_SOURCE_VALUES = Object.keys(HEATMAP_SOURCES)

// Stops are shared by the renderer and the legend so the two can never drift.
export const HEATMAP_GRADIENT = {
  0.2: "#2563EB",
  0.4: "#16A34A",
  0.6: "#CA8A04",
  0.8: "#EA580C",
  1.0: "#DC2626",
}

export const DENSITY_LEVELS = [
  { key: "low", label: "Low", stop: 0.2 },
  { key: "medium", label: "Medium", stop: 0.6 },
  { key: "high", label: "High", stop: 1.0 },
]

export const HEATMAP_DEFAULTS = {
  radius: 28,
  blur: 20,
  opacity: 0.6,
  maxZoom: 16,
  // Intensity at which a cell reaches the top of the gradient.
  max: 1.0,
}

export const HEATMAP_LIMITS = {
  radius: { min: 8, max: 60, step: 1 },
  blur: { min: 0, max: 40, step: 1 },
  opacity: { min: 0.1, max: 1, step: 0.05 },
}

// Project.priority enum -> relative intensity. Complaints have no equivalent
// field, so they are deliberately absent from this map.
export const PRIORITY_WEIGHTS = {
  Low: 0.4,
  Medium: 0.6,
  High: 0.8,
  Critical: 1.0,
}

export const DEFAULT_WEIGHT = 0.6

/**
 * Intensity for one record. Uses Project.priority when present; anything else —
 * including every complaint — contributes a uniform weight rather than an
 * invented one.
 */
export function densityWeight(record) {
  const priority = record?.priority
  if (priority && PRIORITY_WEIGHTS[priority] !== undefined) return PRIORITY_WEIGHTS[priority]
  return DEFAULT_WEIGHT
}

/** Colour at a gradient stop; used by the legend. */
export const densityColor = (stop) => HEATMAP_GRADIENT[stop] || HEATMAP_GRADIENT[1.0]

/** CSS gradient string mirroring HEATMAP_GRADIENT, for the legend ramp. */
export const gradientCss = () =>
  `linear-gradient(90deg, ${Object.entries(HEATMAP_GRADIENT)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([stop, color]) => `${color} ${Number(stop) * 100}%`)
    .join(", ")})`
