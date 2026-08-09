// Shared shell for the public read-only Citizen portal.

import { useState } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import CiviqLogo, { CiviqMark } from "../../components/Brand"
import { Button, Container } from "../../components/public/ui"
import { FOCUS_RING } from "../../components/public/controlStyles"

// Public navigation.
const navLinks = [
  { label: "Home", path: "/home" },
  { label: "Projects", path: "/projects" },
  { label: "Report an issue", path: "/complaints/new" },
  { label: "Track complaint", path: "/complaints/track" },
]

const linkCls = (active) =>
  [
    "px-3 py-2 rounded-[7px] text-[14px] transition-colors duration-150",
    FOCUS_RING,
    active
      ? "bg-[#EEF2FF] text-[#3F4899] font-semibold"
      : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-normal",
  ].join(" ")

function MenuIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? (
        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
      ) : (
        <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
      )}
    </svg>
  )
}

function CitizenHeader() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (path) =>
    path === "/home" ? pathname === "/" || pathname === "/home" : pathname.startsWith(path)

  return (
    // Above Leaflet's control corners (z-index 1000) so map chrome cannot scroll over the header.
    <header className="sticky top-0 z-[1100] bg-[#FFFFFF]/95 backdrop-blur-[6px] border-b border-[#E2E8F0]">
      <Container className="h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/home" className={`rounded-[6px] hover:opacity-80 transition-opacity ${FOCUS_RING}`} aria-label="CIVIQ home">
            <CiviqLogo size={26} />
          </Link>
          <span className="hidden lg:block pl-3 border-l border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#94A3B8]">
            Ghaziabad Municipal<br />Corporation
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1" aria-label="Public portal">
          {navLinks.map((link) => (
            <NavLink key={link.path} to={link.path} className={() => linkCls(isActive(link.path))}>
              {link.label}
            </NavLink>
          ))}
          <Button to="/login" variant="secondary" size="sm" className="ml-3">Staff sign in</Button>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="citizen-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className={`md:hidden inline-flex h-10 w-10 -mr-1 items-center justify-center rounded-[8px] text-[#475569] hover:bg-[#F1F5F9] transition-colors ${FOCUS_RING}`}
        >
          <MenuIcon open={open} />
        </button>
      </Container>

      {open && (
        <div id="citizen-mobile-nav" className="md:hidden border-t border-[#E2E8F0] bg-[#FFFFFF]">
          <Container className="py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => setOpen(false)}
                className={() => `${linkCls(isActive(link.path))} block`}
              >
                {link.label}
              </NavLink>
            ))}
            <Button to="/login" variant="secondary" size="md" onClick={() => setOpen(false)} className="mt-2 w-full">
              Staff sign in
            </Button>
          </Container>
        </div>
      )}
    </header>
  )
}

const footerGroups = [
  {
    title: "For residents",
    links: [
      { label: "Browse projects", path: "/projects" },
      { label: "Report an issue", path: "/complaints/new" },
      { label: "Track a complaint", path: "/complaints/track" },
    ],
  },
  {
    title: "For staff",
    links: [{ label: "Staff sign in", path: "/login" }],
  },
]

function CitizenFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto bg-[#FFFFFF] border-t border-[#E2E8F0]">
      <Container className="py-10 sm:py-12">
        <div className="grid gap-8 sm:gap-10 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2 flex flex-col gap-3 max-w-[380px]">
            <CiviqLogo size={24} />
            <p className="text-[13px] font-medium text-[#475569]">Plan together. Build once.</p>
          </div>

          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">{group.title}</p>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.path}>
                    <Link to={link.path} className={`rounded-[4px] text-[13px] text-[#475569] hover:text-[#5E6AD2] transition-colors ${FOCUS_RING}`}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-[#94A3B8]">© {year} Ghaziabad Municipal Corporation</p>
          <span className="flex items-center gap-2 text-[12px] text-[#94A3B8]">
            <CiviqMark size={16} />
            Public transparency portal
          </span>
        </div>
      </Container>
    </footer>
  )
}

export default function CitizenNav({ children }) {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[#F8FAFC] text-[#0F172A]">
      <a
        href="#main-content"
        className={`sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1200] focus:rounded-[8px] focus:bg-[#0D2145] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-[#FFFFFF] ${FOCUS_RING}`}
      >
        Skip to content
      </a>

      <CitizenHeader />

      <main id="main-content" className="flex-1">{children}</main>

      <CitizenFooter />
    </div>
  )
}
