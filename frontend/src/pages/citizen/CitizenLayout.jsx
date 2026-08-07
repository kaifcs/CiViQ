// Shell for the public citizen area. Separate from DashboardLayout because these
// routes are unauthenticated: no sidebar, no role navigation, no notification
// bell, and nothing here may assume a session exists.

import CitizenHeader from "./CitizenHeader"
import CitizenFooter from "./CitizenFooter"

export default function CitizenLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col">
      <CitizenHeader />
      <main className="flex-1">{children}</main>
      <CitizenFooter />
    </div>
  )
}
