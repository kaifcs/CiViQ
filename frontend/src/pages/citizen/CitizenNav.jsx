// Shared shell for the public read-only Citizen portal.

import { Link, NavLink } from "react-router-dom"

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

// Public navigation.
const navLinks = [
  { label: "Home", path: "/home" },
  { label: "Projects", path: "/projects" },
  { label: "Report an issue", path: "/complaints/new" },
  { label: "Track complaint", path: "/complaints/track" },
]

function CitizenHeader() {
  return (
    <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/home" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <CiviqLogoIcon size={28} />
          <CiviqWordmark size={28} />
        </Link>
        <span className="hidden md:block text-[12px] font-medium text-[#9CA3AF] uppercase tracking-[0.06em]">Ghaziabad Municipal Corporation</span>
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.path === "/home"}
              className={({ isActive }) =>
                [
                  "px-3 py-1.5 rounded-[6px] text-[14px] transition-all duration-150",
                  isActive
                    ? "bg-[#EBEBEB] text-[#0F172A] font-semibold"
                    : "text-[#6B7280] hover:bg-[#F3F3F3] hover:text-[#0F172A] font-normal",
                ].join(" ")
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link
            to="/login"
            className="ml-2 px-3 py-1.5 rounded-[6px] text-[14px] font-medium text-[#5E6AD2] border border-[#5E6AD2]/30 hover:bg-[#EEF2FF] transition-all duration-150"
          >
            Staff Login
          </Link>
        </nav>
      </div>
    </header>
  )
}

function CitizenFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-white border-t border-[#E5E5E5] mt-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-[#0D2145]">CIVIQ</p>
            <p className="text-[11px] text-[#9CA3AF]">Plan together. Build once.</p>
          </div>
          <p className="text-[12px] text-[#9CA3AF]">© {year} Ghaziabad Municipal Corporation</p>
        </div>
      </div>
    </footer>
  )
}

export default function CitizenNav({ children }) {
  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col">
      <CitizenHeader />
      <main className="flex-1">{children}</main>
      <CitizenFooter />
    </div>
  )
}
