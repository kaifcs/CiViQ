// Public navigation bar for the citizen area. Carries no account controls by
// design: these routes are unauthenticated, and staff sign in through /login.

import { useNavigate, useLocation } from "react-router-dom"

function CiviqLogoIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="0" y="11.5" width="28" height="5" fill="#0D2145" rx="0.5"/>
      <rect x="11.5" y="0" width="5" height="28" fill="#0D2145" rx="0.5"/>
      <rect x="0" y="10" width="10.5" height="1.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="17.5" y="10" width="10.5" height="1.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="0" y="16.5" width="10.5" height="1.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="17.5" y="16.5" width="10.5" height="1.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="10" y="0" width="1.5" height="10.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="16.5" y="0" width="1.5" height="10.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="10" y="17.5" width="1.5" height="10.5" fill="rgba(13,33,69,0.35)"/>
      <rect x="16.5" y="17.5" width="1.5" height="10.5" fill="rgba(13,33,69,0.35)"/>
      <circle cx="14" cy="14" r="3.5" fill="#5E6AD2"/>
      <circle cx="14" cy="14" r="1.5" fill="white"/>
    </svg>
  )
}

function CiviqWordmark({ size = 28 }) {
  return (
    <svg viewBox="0 0 108 28" height={size} fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <text x="0" y="22" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="800" letterSpacing="-0.5" fill="#0D2145">C</text>
      <text x="19" y="22" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="800" fill="#0D2145">i</text>
      <circle cx="22" cy="3" r="2.5" fill="#5E6AD2"/>
      <text x="26" y="22" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="800" fill="#0D2145">V</text>
      <text x="44" y="22" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="800" fill="#0D2145">i</text>
      <circle cx="48" cy="3" r="2.5" fill="#5E6AD2"/>
      <text x="51" y="22" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="800" fill="#0D2145">Q</text>
    </svg>
  )
}

const navLinks = [
  { label: "Home", path: "/home" },
  { label: "Projects", path: "/projects" },
  { label: "Report", path: "/report" },
  { label: "Track", path: "/track" },
]

export default function CitizenHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={() => navigate("/home")} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <CiviqLogoIcon size={28} />
          <CiviqWordmark size={28} />
        </button>
        <span className="hidden md:block text-[12px] font-medium text-[#9CA3AF] uppercase tracking-[0.06em]">Ghaziabad Municipal Corporation</span>
        {/* Scrolls rather than widening the page: four links exceed a 390px viewport. */}
        <nav className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {navLinks.map(link => {
            const active = location.pathname === link.path
            return (
              <button key={link.path} onClick={() => navigate(link.path)} className={["px-3 py-1.5 rounded-[6px] text-[14px] transition-all duration-150", active ? "bg-[#EBEBEB] text-[#0F172A] font-semibold" : "text-[#6B7280] hover:bg-[#F3F3F3] hover:text-[#0F172A] font-normal"].join(" ")}>
                {link.label}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
