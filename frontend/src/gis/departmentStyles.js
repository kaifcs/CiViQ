// Marker styling for the department layer. Colour is not defined here:
// Department.color is a stored field, and its schema default of "#000000" is
// treated as unset so those departments fall back rather than render black.

export const FALLBACK_COLOR = "#6B7280"
export const DEPARTMENT_MARKER_SIZE = 13
export const SELECTED_MARKER_SCALE = 1.5

const UNSET_COLORS = new Set(["", "#000", "#000000"])

// Builds a department code -> colour lookup from adapted department records.
export function departmentColorIndex(departments = []) {
  const map = new Map()
  for (const dept of departments) {
    if (!dept?.code) continue
    map.set(dept.code, UNSET_COLORS.has((dept.color || "").toLowerCase()) ? null : dept.color)
  }
  return map
}

export const departmentColor = (code, colorIndex) =>
  colorIndex?.get(code) || FALLBACK_COLOR

// Marker appearance for one department-owned asset. Colour comes from the
// owning department, so the map reads as "who owns what".
export function departmentMarkerStyle(record, { selected = false } = {}, colorIndex) {
  return {
    color: departmentColor(record?.department, colorIndex),
    size: selected
      ? Math.round(DEPARTMENT_MARKER_SIZE * SELECTED_MARKER_SCALE)
      : DEPARTMENT_MARKER_SIZE,
    selected,
  }
}
