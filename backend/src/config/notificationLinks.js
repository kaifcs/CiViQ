// Where a notification points, per recipient role.
//
// Client routes are namespaced by role: the same project is /admin/projects/:id
// to an administrator, /officer/projects/:id to its officer and
// /supervisor/tasks/:id to its supervisor. A notification is addressed to ONE
// recipient, so its link has to be built for that recipient's role — a stored
// /officer/... path handed to an administrator is refused by the client router,
// which redirects them to their own dashboard instead of the record.
//
// Producers therefore name a destination (`{ kind, id }`) rather than a path,
// and notificationService resolves it once it knows who is receiving it.
//
// Kinds map to real registered routes only. A role with no screen for a kind
// resolves to no link at all, which is already a supported state — role_changed
// has never carried one — rather than to a path that would bounce.

const NOTIFICATION_LINK_KINDS = {
  PROJECT: "project",
  CONFLICTS: "conflicts",
  CONFLICT: "conflict",
  COMPLAINT: "complaint",
}

// Mirrors frontend/src/router/AppRouter.jsx. A kind absent from a role is
// deliberate: the supervisor shell has dashboard, tasks and settings only, and
// the citizen routes are the public ones.
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
    // Not the dashboard: /supervisor/tasks/:id is the screen where a supervisor
    // actually records progress, and it is the same route the supervisor
    // dashboard and task list already link to.
    project: (id) => `/supervisor/tasks/${id}`,
  },
  citizen: {
    // The public project page. Citizens receive no conflict or complaint
    // notification, so nothing else is mapped.
    project: (id) => `/projects/${id}`,
  },
}

/**
 * Resolves a destination to a client path for one role.
 *
 * Returns undefined when the role has no screen for that kind, or when the
 * destination is absent or malformed — callers store no link rather than one
 * the recipient cannot open.
 */
function linkFor(role, target) {
  if (!target || !target.kind) return undefined
  const build = ROLE_ROUTES[role] && ROLE_ROUTES[role][target.kind]
  if (typeof build !== "function") return undefined
  if (target.kind !== NOTIFICATION_LINK_KINDS.CONFLICTS && !target.id) return undefined
  return build(target.id)
}

module.exports = { NOTIFICATION_LINK_KINDS, ROLE_ROUTES, linkFor }
