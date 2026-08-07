import { useNavigate } from "react-router-dom"

// Sidebar navigation for the supervisor shell. DashboardLayout reports the id
// of the item that was activated; anything unrecognised is ignored.
export function useSupervisorNav() {
  const navigate = useNavigate()
  return (id) => {
    const routes = {
      dashboard: "/supervisor/dashboard",
      tasks: "/supervisor/tasks",
      settings: "/supervisor/settings",
    }
    if (routes[id]) navigate(routes[id])
  }
}
