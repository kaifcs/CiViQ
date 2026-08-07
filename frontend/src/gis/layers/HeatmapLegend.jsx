import { DENSITY_LEVELS, gradientCss } from "../heatmapStyles"

// Density ramp legend. Reads the same gradient the renderer uses, so the two
// cannot drift apart.
export default function HeatmapLegend({ className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
        {DENSITY_LEVELS[0].label}
      </span>
      <div
        className="h-2 w-24 rounded-full flex-shrink-0 border border-[#E5E5E5] dark:border-[#27272A]"
        style={{ backgroundImage: gradientCss() }}
      />
      <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
        {DENSITY_LEVELS[DENSITY_LEVELS.length - 1].label}
      </span>
      <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">density</span>
    </div>
  )
}
