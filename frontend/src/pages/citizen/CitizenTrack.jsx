// Citizen complaint tracking by CNR id — not yet built. Complaints already carry
// the public cnrId this screen will look up.

import CitizenLayout from "./CitizenLayout"

export default function CitizenTrack() {
  return (
    <CitizenLayout>
      <div className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-[12px] bg-[#EEF2FF] flex items-center justify-center">
          <svg width="22" height="22" fill="none" stroke="#5E6AD2" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <h1 className="text-[24px] font-semibold text-[#0F172A]">Track Complaint</h1>
        <p className="text-[13px] text-[#6B7280]">Building in Phase 5</p>
      </div>
    </CitizenLayout>
  )
}
