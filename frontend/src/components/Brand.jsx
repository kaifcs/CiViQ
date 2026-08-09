// CIVIQ brand marks, shared by the public shell, the sign-in screen and the
// authenticated sidebar. `tone="onDark"` inverts the road fill and wordmark ink
// so the logo reads on the navy panel and in dark mode.

const NAVY = '#0D2145'
const ACCENT = '#5E6AD2'

export function CiviqMark({ size = 28, tone = 'onLight' }) {
  const road = tone === 'onDark' ? '#FFFFFF' : NAVY
  const lane = tone === 'onDark' ? 'rgba(255,255,255,0.35)' : 'rgba(13,33,69,0.35)'
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <rect x="0"    y="11.5" width="28"   height="5"    fill={road} rx="0.5"/>
      <rect x="11.5" y="0"    width="5"    height="28"   fill={road} rx="0.5"/>
      <rect x="0"    y="10"   width="10.5" height="1.5"  fill={lane}/>
      <rect x="17.5" y="10"   width="10.5" height="1.5"  fill={lane}/>
      <rect x="0"    y="16.5" width="10.5" height="1.5"  fill={lane}/>
      <rect x="17.5" y="16.5" width="10.5" height="1.5"  fill={lane}/>
      <rect x="10"   y="0"    width="1.5"  height="10.5" fill={lane}/>
      <rect x="16.5" y="0"    width="1.5"  height="10.5" fill={lane}/>
      <rect x="10"   y="17.5" width="1.5"  height="10.5" fill={lane}/>
      <rect x="16.5" y="17.5" width="1.5"  height="10.5" fill={lane}/>
      <circle cx="14" cy="14" r="3.5" fill={ACCENT}/>
      <circle cx="14" cy="14" r="1.5" fill="#FFFFFF"/>
    </svg>
  )
}

// Hand-placed dotless "ı" glyphs with brand-coloured accent dots above them.
export function CiviqWordmark({ size = 28, tone = 'onLight' }) {
  const ink = tone === 'onDark' ? '#FFFFFF' : NAVY
  return (
    <svg
      viewBox="0 0 76 28"
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <text x="0"  y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" letterSpacing="-0.5" fill={ink}>C</text>
      <text x="19" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={ink}>ı</text>
      <circle cx="22" cy="3" r="2.5" fill={ACCENT}/>
      <text x="26" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={ink}>V</text>
      <text x="44" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={ink}>ı</text>
      <circle cx="48" cy="3" r="2.5" fill={ACCENT}/>
      <text x="51" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={ink}>Q</text>
    </svg>
  )
}

export default function CiviqLogo({ size = 28, tone = 'onLight', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <CiviqMark size={size} tone={tone} />
      <CiviqWordmark size={size} tone={tone} />
      <span className="sr-only">CIVIQ</span>
    </span>
  )
}
