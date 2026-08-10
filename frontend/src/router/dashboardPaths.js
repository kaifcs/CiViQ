export const DASHBOARD_PATHS = {
  admin: '/admin/dashboard',
  officer: '/officer/dashboard',
  supervisor: '/supervisor/dashboard',
}

export function dashboardPathFor(role) {
  return DASHBOARD_PATHS[role] || null
}
