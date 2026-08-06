// 404 for the public citizen area, kept inside CitizenLayout so an unknown URL
// still offers navigation rather than stranding the visitor.

import { useNavigate } from "react-router-dom"
import CitizenLayout from "./CitizenLayout"

export default function CitizenNotFound() {
  const navigate = useNavigate()
  return (
    <CitizenLayout>
      <div className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col items-center justify-center text-center gap-5">
        <div className="w-14 h-14 rounded-[12px] bg-[#FEF2F2] flex items-center justify-center">
          <svg width="24" height="24" fill="none" stroke="#DC2626" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <h1 className="text-[24px] font-semibold text-[#0F172A]">Page not found</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">This page does not exist or has been moved.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/home")} className="px-4 py-2 bg-[#5E6AD2] hover:bg-[#4A56C1] text-white text-[14px] font-medium rounded-[6px] transition-colors">Back to Home</button>
          <button onClick={() => navigate("/report")} className="px-4 py-2 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-[14px] font-medium rounded-[6px] transition-colors">Report a Problem</button>
        </div>
      </div>
    </CitizenLayout>
  )
}
