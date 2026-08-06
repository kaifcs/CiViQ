// Footer for the public citizen area. Link targets include routes that are
// still stubs, so the navigation reads as complete while the screens are built.

import { useNavigate } from 'react-router-dom'

const footerLinks = [
  { label: 'Home', path: '/home' },
  { label: 'Projects', path: '/projects' },
  { label: 'Report', path: '/report' },
  { label: 'Track', path: '/track' },
]

export default function CitizenFooter() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()

  return (
    <footer className="bg-white border-t border-[#E5E5E5] mt-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-[#0D2145]">CIVIQ</p>
            <p className="text-[11px] text-[#9CA3AF]">Plan together. Build once.</p>
          </div>

          <div className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="text-[13px] text-[#6B7280] hover:text-[#0F172A] transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          <p className="text-[12px] text-[#9CA3AF]">© {year} Ghaziabad Municipal Corporation</p>
        </div>
      </div>
    </footer>
  )
}
