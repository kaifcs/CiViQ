// 404 for the public transparency portal, kept inside CitizenNav so an
// unknown URL still offers navigation rather than stranding the visitor.

import CitizenNav from "./CitizenNav"
import { Button, Container } from "../../components/public/ui"

export default function CitizenNotFound() {
  return (
    <CitizenNav>
      <Container width="narrow" className="py-20 sm:py-28 flex flex-col items-center justify-center text-center gap-6">
        <span className="w-14 h-14 rounded-[14px] bg-[#FEF2F2] flex items-center justify-center">
          <svg width="24" height="24" fill="none" stroke="#DC2626" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] sm:text-[30px] font-bold text-[#0D2145] tracking-[-0.025em]">Page not found</h1>
          <p className="text-[14.5px] text-[#64748B]">This page does not exist or has been moved.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Button to="/home" size="md" className="w-full sm:w-auto">Back to home</Button>
          <Button to="/projects" variant="secondary" size="md" className="w-full sm:w-auto">View projects</Button>
        </div>
      </Container>
    </CitizenNav>
  )
}
