// Citizen project detail — NOT YET BUILT.
//
// Registered stub route; see CitizenProjects.jsx for the convention.

import CitizenLayout from "./CitizenLayout"

export default function CitizenProjectDetail() {
  return (
    <CitizenLayout>
      <div className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-[12px] bg-[#EEF2FF] flex items-center justify-center">
          <svg width="22" height="22" fill="none" stroke="#5E6AD2" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <h1 className="text-[24px] font-semibold text-[#0F172A]">Project Detail</h1>
        <p className="text-[13px] text-[#6B7280]">Building in Phase 5</p>
      </div>
    </CitizenLayout>
  )
}
