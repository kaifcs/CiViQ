// Where a notification points, per recipient role. Client routes are namespaced
// by role, so a path built for the wrong one is refused by the client router.
// Producers name a destination; notificationService resolves it per recipient.

const NOTIFICATION_LINK_KINDS = {
  PROJECT: "project",
  CONFLICTS: "conflicts",
  CONFLICT: "conflict",
  COMPLAINT: "complaint",
}

// Mirrors frontend/src/router/AppRouter.jsx. A kind absent from a role is
// deliberate: that role has no screen for it.
const ROLE_ROUTES = {
  admin: {
    project: (id) => `/admin/projects/${id}`,
    conflicts: () => "/admin/conflicts",
    conflict: (id) => `/admin/conflicts/${id}`,
    complaint: (id) => `/admin/complaints/${id}`,
  },
  officer: {
    project: (id) => `/officer/projects/${id}`,
    conflicts: () => "/officer/conflicts",
    conflict: (id) => `/officer/conflicts/${id}`,
    complaint: (id) => `/officer/complaints/${id}`,
  },
  supervisor: {
    // /supervisor/tasks/:id, not the dashboard: it is where progress is recorded.
    project: (id) => `/supervisor/tasks/${id}`,
  },
  citizen: {
    project: (id) => `/projects/${id}`,
  },
}

// Undefined when the role has no screen for the kind, or the target is
// malformed — callers then store no link rather than one that cannot be opened.
function linkFor(role, target) {
  if (!target || !target.kind) return undefined
  const build = ROLE_ROUTES[role] && ROLE_ROUTES[role][target.kind]
  if (typeof build !== "function") return undefined
  if (target.kind !== NOTIFICATION_LINK_KINDS.CONFLICTS && !target.id) return undefined
  return build(target.id)
}

module.exports = { NOTIFICATION_LINK_KINDS, ROLE_ROUTES, linkFor }
