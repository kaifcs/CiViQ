// Citizen "City Explorer" — not yet built. The route is registered so the
// navigation is complete and the URL stays stable; nothing here fetches data.

import CitizenLayout from "./CitizenLayout"

export default function CitizenProjects() {
  return (
    <CitizenLayout>
      <div className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-[12px] bg-[#EEF2FF] flex items-center justify-center">
          <svg width="22" height="22" fill="none" stroke="#5E6AD2" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <h1 className="text-[24px] font-semibold text-[#0F172A]">City Explorer</h1>
        <p className="text-[13px] text-[#6B7280]">Building in Phase 5</p>
      </div>
    </CitizenLayout>
  )
}
