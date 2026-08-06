// Canonical styling for the conflict layer.
//
// SEVERITY: the backend Conflict.severity enum has exactly two values,
// "incompatible" and "conditional", which adaptConflict maps to "high" and
// "medium". The four-level scale below is defined in full so the layer is ready
// if the enum grows, but only `high` and `medium` are reachable from real data
// today — nothing here invents a severity a conflict does not have.
//
// STATUS and TYPE keys are the backend vocabularies, mapped through the same
// adapter the conflict screens already use.

export const CONFLICT_SEVERITY_COLORS = {
  low: "#65A30D",
  medium: "#D97706",
  high: "#DC2626",
  critical: "#7F1D1D",
}

export const CONFLICT_SEVERITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}

// Severities the backend enum can actually produce, via adaptConflict.
export const REACHABLE_SEVERITIES = ["medium", "high"]
export const CONFLICT_SEVERITIES = Object.keys(CONFLICT_SEVERITY_COLORS)

// adaptConflict vocabulary, derived from Conflict.status.
export const CONFLICT_STATUS_LABELS = {
  unresolved: "Unresolved",
  pending_response: "Awaiting officer",
  resolved: "Resolved",
}
export const CONFLICT_STATUSES = Object.keys(CONFLICT_STATUS_LABELS)

// Conflict.clashTypes enum.
export const CONFLICT_TYPES = {
  geographic: "Geographic",
  timeline: "Timeline",
  worktype: "Work type",
}
export const CONFLICT_TYPE_VALUES = Object.keys(CONFLICT_TYPES)

export const FALLBACK_COLOR = "#6B7280"
export const CONFLICT_MARKER_SIZE = 20
export const SELECTED_LINE_WEIGHT = 6
export const LINE_WEIGHT = 3
// Dashed so a connector never reads as a utility corridor.
export const LINE_DASH = "6 6"

// Warning triangle, 24x24, matching the single-path glyph contract of
// markerIcons.createGlyphIcon.
export const CONFLICT_GLYPH = "M12 9v4M12 16.5v.5M12 3l9 16H3z"

export const conflictSeverityColor = (severity) =>
  CONFLICT_SEVERITY_COLORS[severity] || FALLBACK_COLOR
export const conflictSeverityLabel = (severity) =>
  CONFLICT_SEVERITY_LABELS[severity] || severity || "Unknown"
export const conflictStatusLabel = (status) =>
  CONFLICT_STATUS_LABELS[status] || status || "Unknown"
export const conflictTypeLabel = (type) => CONFLICT_TYPES[type] || type

/** Human list of the clash types the backend recorded. */
export const conflictTypesLabel = (types = []) =>
  types.map(conflictTypeLabel).join(", ")

/** Marker appearance for a conflict endpoint. Severity drives colour. */
export function conflictMarkerStyle(record, { selected = false } = {}) {
  return {
    color: conflictSeverityColor(record?.severity),
    size: CONFLICT_MARKER_SIZE,
    glyph: CONFLICT_GLYPH,
    muted: record?.status === "resolved",
    selected,
  }
}

/** Vector style for the connector between two conflicting projects. */
export function conflictLineStyle(record, { selected = false } = {}) {
  const resolved = record?.status === "resolved"
  return {
    color: conflictSeverityColor(record?.severity),
    weight: selected ? SELECTED_LINE_WEIGHT : LINE_WEIGHT,
    opacity: resolved ? 0.4 : selected ? 1 : 0.85,
    dashArray: LINE_DASH,
    lineCap: "round",
    fill: false,
  }
}
