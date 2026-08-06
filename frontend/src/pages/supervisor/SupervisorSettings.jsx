// Supervisor settings — NOT YET BUILT.
//
// Registered stub route. The admin and officer settings screens are the
// implemented reference.
//
// Renders bare content: AppRouter already wraps this route in SupervisorLayout,
// which is DashboardLayout. Rendering a second one here nested a whole shell
// inside the first, so the screen showed two sidebars and two navbars.

import PlaceholderPage from "../../components/PlaceholderPage"

export default function SupervisorSettings() {
  return <PlaceholderPage title="Settings" phase={5} />
}
