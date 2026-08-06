/**
 * Neutral chip for table cells and badges.
 *
 * Distinct from components/Badge.jsx, which renders a fixed set of known
 * variants with its own labels; this takes arbitrary text and an optional
 * colour, which is what the dashboard tables need.
 */
export default function Pill({ children, color, className = '' }) {
  if (color) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}
        style={{ backgroundColor: `${color}1F`, color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {children}
      </span>
    )
  }

  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-[#F1F5F9] dark:bg-[#1A1F2B] text-[#475569] dark:text-[#94A3B8] ${className}`}>
      {children}
    </span>
  )
}
