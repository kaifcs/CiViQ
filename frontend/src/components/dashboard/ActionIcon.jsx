// 15px stroked SVG wrapper: `d` is the path content, so every icon inherits the
// same stroke weight and cap style. Decorative by default — callers carry their
// own visible or aria label, so the glyph is hidden from assistive technology.
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
