// Public landing page for the Citizen portal.

import { useNavigate } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { ActionIcon } from "../../components/dashboard"

const HIGHLIGHTS = [
  {
    title: "Coordinated Planning",
    body: "Every department's road, water, sewage, electrical and parks work is planned on one shared timeline instead of in isolation.",
    d: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  },
  {
    title: "Conflict Prevention",
    body: "Projects that would dig up the same street twice, or clash on timing, are flagged and resolved before work begins.",
    d: <><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></>,
  },
  {
    title: "Public Transparency",
    body: "Approved and in-progress work across the city is open to view here — what it is, where it is, and how far along it stands.",
    d: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
  },
]

export default function CitizenHome() {
  const navigate = useNavigate()

  return (
    <CitizenNav>
      <div className="max-w-[1200px] mx-auto px-6 py-16 flex flex-col gap-14" style={{ fontFamily: "'Inter', sans-serif" }}>

        <div className="flex flex-col items-center text-center gap-4 max-w-[640px] mx-auto">
          <span className="text-[12px] font-semibold text-[#5E6AD2] uppercase tracking-[0.08em]">Ghaziabad Municipal Corporation</span>
          <h1 className="text-[32px] font-semibold text-[#0F172A] leading-tight">
            Smart, coordinated infrastructure work for Ghaziabad
          </h1>
          <p className="text-[15px] text-[#6B7280] leading-relaxed">
            CIVIQ is the city's Smart Urban Project Coordination Platform. It helps municipal departments
            plan, sequence and track infrastructure projects together, so the same street is not dug up
            twice and residents can see what is being built, where, and when.
          </p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-2 px-5 py-2.5 bg-[#5E6AD2] hover:bg-[#4A56C1] text-white text-[14px] font-medium rounded-[6px] transition-colors"
          >
            View Public Projects
          </button>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="bg-white border border-[#E5E5E5] rounded-[8px] p-5 flex flex-col gap-3" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div className="w-9 h-9 rounded-[8px] bg-[#EEF2FF] flex items-center justify-center text-[#5E6AD2]">
                <ActionIcon d={h.d} size={18} />
              </div>
              <h2 className="text-[15px] font-semibold text-[#0F172A]">{h.title}</h2>
              <p className="text-[13px] text-[#6B7280] leading-relaxed">{h.body}</p>
            </div>
          ))}
        </div>

      </div>
    </CitizenNav>
  )
}
