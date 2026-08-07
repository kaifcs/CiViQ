// Citizen complaint submission — not yet built. The backend complaint intake
// exists and is documented in the OpenAPI spec; only this screen is outstanding.

import CitizenLayout from "./CitizenLayout"

export default function CitizenReport() {
  return (
    <CitizenLayout>
      <div className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-[12px] bg-[#EEF2FF] flex items-center justify-center">
          <svg width="22" height="22" fill="none" stroke="#5E6AD2" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h1 className="text-[24px] font-semibold text-[#0F172A]">Report a Problem</h1>
        <p className="text-[13px] text-[#6B7280]">Building in Phase 5</p>
      </div>
    </CitizenLayout>
  )
}
