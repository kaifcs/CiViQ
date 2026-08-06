// Canonical marker styling for the project layer.
//
// Colours are data, not presentation classes: the same value drives the map
// marker, the legend swatch and the drawer dot, so there is one place to change
// a project's colour. Tailwind badge classes stay with the screens that own them.
//
// Status keys are the backend Project.status enum verbatim; priority keys are
// the Project.priority enum. Types are the Title Case labels adaptProject emits.

// Reuses the hex values already established by the City Map screens so the
// visual language is unchanged.
export const PROJECT_TYPE_COLORS = {
  Road: "#EA580C",
  Water: "#2563EB",
  Electrical: "#CA8A04",
  Sewage: "#7C3AED",
  Parks: "#16A34A",
  Other: "#6B7280",
}

// All six backend statuses. The City Map screens only ever styled four of them;
// completed and rescheduled previously fell through to a default grey.
export const PROJECT_STATUS_COLORS = {
  pending: "#94A3B8",
  approved: "#16A34A",
  active: "#5E6AD2",
  rejected: "#DC2626",
  completed: "#64748B",
  rescheduled: "#D97706",
}

export const PROJECT_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  active: "Active",
  rejected: "Rejected",
  completed: "Completed",
  rescheduled: "Rescheduled",
}

export const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"]

// Priority drives marker size rather than colour, so it reads alongside the
// status colour instead of competing with it.
export const PRIORITY_MARKER_SIZE = {
  Low: 12,
  Medium: 14,
  High: 17,
  Critical: 20,
}

export const DEFAULT_MARKER_SIZE = 14
export const SELECTED_MARKER_SCALE = 1.5

export const FALLBACK_COLOR = "#6B7280"

export const projectTypeColor = (type) => PROJECT_TYPE_COLORS[type] || FALLBACK_COLOR
export const projectStatusColor = (status) => PROJECT_STATUS_COLORS[status] || FALLBACK_COLOR
export const projectStatusLabel = (status) => PROJECT_STATUS_LABELS[status] || status || "Unknown"
export const projectMarkerSize = (priority) => PRIORITY_MARKER_SIZE[priority] || DEFAULT_MARKER_SIZE

/**
 * Marker appearance for one project. Status drives colour because it is what
 * operators scan for; priority drives size; clashes are deliberately ignored
 * here — conflict visualisation is a separate layer.
 */
export function projectMarkerStyle(project, { selected = false } = {}) {
  const size = projectMarkerSize(project?.priority)
  return {
    color: projectStatusColor(project?.status),
    size: selected ? Math.round(size * SELECTED_MARKER_SCALE) : size,
    selected,
  }
}
