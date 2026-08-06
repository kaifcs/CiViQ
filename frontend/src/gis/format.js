// Shared formatting for map surfaces. Lives outside the popup components so
// those files export components only, which is what react-refresh requires.

// Deliberately kept here rather than shared with components/dashboard/format.js
// (whose formatDateLong renders the same output): src/gis imports nothing from
// outside src/gis, and one two-line function is not worth breaking that.

/** Date format used across map popups; matches the project detail screen. */
export const formatMapDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"
