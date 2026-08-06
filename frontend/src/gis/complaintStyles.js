// Canonical marker styling for the complaint layer.
//
// Keys are the backend Complaint enums verbatim — issueType is mapped through
// the Title Case labels adaptComplaint emits, status is the raw enum.
//
// NOTE ON SEVERITY: the Complaint model carries no severity, priority or
// urgency field, and no endpoint returns one. Nothing here invents it; category
// drives colour and status drives emphasis, both from real stored data.

// Complaint status colours reuse the palette the complaint list screen already
// established, so the map and the list read the same.
export const COMPLAINT_STATUS_COLORS = {
  submitted: "#94A3B8",
  acknowledged: "#5E6AD2",
  in_progress: "#D97706",
  resolved: "#16A34A",
}

export const COMPLAINT_STATUS_LABELS = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
}

// Keyed by the labels adaptComplaint produces from the issueType enum
// (pothole, streetlight, water_leak, garbage, drainage, other).
export const COMPLAINT_CATEGORY_COLORS = {
  Pothole: "#EA580C",
  Streetlight: "#CA8A04",
  "Water Leak": "#2563EB",
  Garbage: "#65A30D",
  Drainage: "#7C3AED",
  Other: "#6B7280",
}

// Single-path SVG glyphs on a 24x24 grid, stroked so one path reads at 16px.
// Kept as raw path data rather than components because markers are built as
// HTML strings, not React trees.
export const COMPLAINT_CATEGORY_GLYPHS = {
  Pothole: "M4 17h16M7 17a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3M9 10l1-3M15 10l-1-3",
  Streetlight: "M12 21V9M12 9a4 4 0 0 1 8 0M8 21h8M20 9h-8",
  "Water Leak": "M12 3s5 6 5 9a5 5 0 0 1-10 0c0-3 5-9 5-9z",
  Garbage: "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6",
  Drainage: "M4 8h16M4 12h16M4 16h16M9 4v16M15 4v16",
  Other: "M12 8v5M12 16.5v.5M12 3l9 16H3z",
}

export const COMPLAINT_CATEGORIES = Object.keys(COMPLAINT_CATEGORY_COLORS)
export const COMPLAINT_STATUSES = Object.keys(COMPLAINT_STATUS_COLORS)

export const FALLBACK_COLOR = "#6B7280"
export const COMPLAINT_MARKER_SIZE = 22
export const SELECTED_MARKER_SCALE = 1.35

export const complaintCategoryColor = (category) =>
  COMPLAINT_CATEGORY_COLORS[category] || FALLBACK_COLOR
export const complaintCategoryGlyph = (category) =>
  COMPLAINT_CATEGORY_GLYPHS[category] || COMPLAINT_CATEGORY_GLYPHS.Other
export const complaintStatusColor = (status) => COMPLAINT_STATUS_COLORS[status] || FALLBACK_COLOR
export const complaintStatusLabel = (status) =>
  COMPLAINT_STATUS_LABELS[status] || status || "Unknown"

/**
 * Marker appearance for one complaint. Category drives colour so the map is
 * scannable by issue; resolved complaints are muted so open work stands out.
 */
export function complaintMarkerStyle(complaint, { selected = false } = {}) {
  const resolved = complaint?.status === "resolved"
  return {
    color: complaintCategoryColor(complaint?.issueType),
    size: selected ? Math.round(COMPLAINT_MARKER_SIZE * SELECTED_MARKER_SCALE) : COMPLAINT_MARKER_SIZE,
    glyph: complaintCategoryGlyph(complaint?.issueType),
    muted: resolved,
    selected,
  }
}
