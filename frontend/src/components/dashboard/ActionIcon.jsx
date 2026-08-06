/**
 * 15px stroked SVG wrapper used by quick actions and inline table controls.
 * `d` is the path content, so callers supply geometry only and every icon
 * inherits the same stroke weight and cap style.
 *
 * Decorative by default: quick actions and buttons carry their own visible or
 * aria label, so the glyph is hidden from assistive technology.
 */
export default function ActionIcon({ d, size = 15, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {d}
    </svg>
  )
}
