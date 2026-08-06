// Styling for the utility layer.
//
// Utility types are the subset of the backend Project.projectType enum that
// describes utility infrastructure. There is no separate utility/asset model,
// so these are the only utility categories the backend actually represents —
// notably there is no fiber, telecom or standalone drainage asset type.
//
// Rendering is vector, not marker: utility assets are corridors and pipelines,
// which is why this layer draws stored geometry rather than points.

export const UTILITY_TYPES = {
  water: { label: "Water", color: "#2563EB" },
  sewage: { label: "Sewer", color: "#7C3AED" },
  electricity: { label: "Electric", color: "#CA8A04" },
}

export const UTILITY_TYPE_VALUES = Object.keys(UTILITY_TYPES)
export const FALLBACK_COLOR = "#6B7280"

export const utilityTypeLabel = (type) => UTILITY_TYPES[type]?.label || "Other"
export const utilityTypeColor = (type) => UTILITY_TYPES[type]?.color || FALLBACK_COLOR

/** True when a record's project type is utility infrastructure. */
export const isUtilityRecord = (record) =>
  !!record && Object.prototype.hasOwnProperty.call(UTILITY_TYPES, utilityTypeOf(record))

/**
 * Backend projectType for a record, accepting both the adapted view model
 * (Title Case `type`) and the raw document (`projectType`).
 */
export function utilityTypeOf(record) {
  if (!record) return null
  if (record.projectType) return record.projectType
  if (record._raw?.projectType) return record._raw.projectType
  const label = record.type
  if (!label) return null
  const match = Object.entries(UTILITY_TYPES).find(([, v]) => v.label === label)
  return match ? match[0] : String(label).toLowerCase()
}

/**
 * Vector style for a utility asset. Selection thickens the stroke rather than
 * recolouring it, so the utility type stays identifiable while selected.
 */
export function utilityStyle(record, { selected = false } = {}) {
  const color = utilityTypeColor(utilityTypeOf(record))
  return {
    color,
    weight: selected ? 7 : 4,
    opacity: selected ? 1 : 0.85,
    fillColor: color,
    fillOpacity: selected ? 0.3 : 0.15,
    lineCap: "round",
    lineJoin: "round",
  }
}
