/**
 * Shared presentational shell for map popups: title, optional identifier,
 * badges, labelled rows and a short description.
 *
 * Extracted so every layer's popup renders the same card without duplicating
 * markup. Presentation only — no state, no effects, no handlers — because
 * MarkerLayer renders popups to static markup.
 */
export default function PopupCard({ title, subtitle, badges = [], rows = [], description }) {
  const visibleBadges = badges.filter((b) => b && b.label)
  const visibleRows = rows.filter((r) => r && r.label)

  return (
    <div className="flex flex-col gap-2.5" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] text-[#9CA3AF] dark:text-[#6B7280] font-mono">{subtitle}</span>
        )}
      </div>

      {visibleBadges.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {visibleBadges.map((badge) =>
            // A badge with a colour carries a dot and a tinted ground; without
            // one it falls back to the neutral chip.
            badge.color ? (
              <span
                key={badge.label}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${badge.color}1F`, color: badge.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
                {badge.label}
              </span>
            ) : (
              <span
                key={badge.label}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F1F5F9] dark:bg-[#1A1F2B] text-[#475569] dark:text-[#94A3B8]"
              >
                {badge.label}
              </span>
            )
          )}
        </div>
      )}

      {visibleRows.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-[#E5E5E5] dark:border-[#27272A]">
          {visibleRows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-2">
              <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] w-[64px] flex-shrink-0">
                {row.label}
              </span>
              <span className="text-[12px] text-[#0F172A] dark:text-[#F8FAFC] font-medium">
                {row.value || "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {description && (
        <p className="text-[11px] leading-relaxed text-[#6B7280] dark:text-[#9CA3AF] line-clamp-3">
          {description}
        </p>
      )}
    </div>
  )
}
