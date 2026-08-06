# Frontend Architecture

React 19 with Vite 8, Tailwind 3 and React Router 7. The application holds no
business rules; it renders view models derived from backend responses.

## Layers

```
main.jsx
  └── AuthProvider
        └── NotificationProvider
              └── AppRouter
                    └── page components
                          ├── hooks/          data fetching
                          │     └── services/ API client + adapters
                          ├── components/     shared UI
                          └── gis/            map rendering
```

Provider order is load-bearing: `NotificationProvider` reads the session through
`useAuth`, so it must sit inside `AuthProvider`. It fetches nothing until a user
is present, which keeps the signed-out application from opening a notification
stream.

## Service layer — `src/services/`

| Module | Responsibility |
|---|---|
| `apiClient.js` | Axios instance, token injection, 401 handling, error normalisation |
| `index.js` | One API object per resource; unwraps response envelopes |
| `adapters.js` | Backend models → view models |
| `notificationStream.js` | SSE transport |

### apiClient

Base URL from `VITE_API_URL`, defaulting to `http://localhost:5000/api`. A
request interceptor attaches `Authorization: Bearer <token>` from
`localStorage` under the key `civiq_token`.

A response interceptor clears the stored session on any 401 and dispatches the
`civiq:auth-expired` window event. `AuthContext` listens for it, which avoids a
circular dependency between the API layer and React.

`normaliseError` collapses any failure into `{ status, message, code, requestId }`.
`code` comes from the standard error envelope and is `null` when absent;
`requestId` is read from the `X-Request-Id` response header so a reported fault
can be matched to a server log line. It is never rendered.

`readPagination` reads the `X-Total-*` headers into
`{ total, page, limit, totalPages, hasNext, hasPrevious }`, returning `null` when
the endpoint did not paginate.

### API modules

`authApi`, `departmentsApi`, `usersApi`, `projectsApi`, `conflictsApi`,
`complaintsApi`, `notificationsApi`, `auditApi`, `dashboardApi`.

Each unwraps the envelope its endpoint uses, so callers always receive plain
data: `dashboardApi` returns `data.data`; `usersApi` returns `data.users`;
`projectsApi` returns the bare array or document.

`buildProjectPayload(form)` translates the project wizard's flat form state into
the backend schema, including the `projectType` label → enum mapping and the
nested `location` and `mcdmInputs` objects.

### Adapters

Every screen reads adapted view models rather than raw payloads. Two rules hold
throughout:

- **Nothing is fabricated.** A field with no backend source is `null` or
  `false`. `UNAVAILABLE_FIELDS` declares these explicitly per entity.
- **A redacted reference degrades gracefully.** When the backend collapses a
  project inside a conflict to a bare id, `adaptConflict` yields the id with
  `null` title, score, department and coordinates, keeping the conflict usable.

Adapters also translate vocabulary. Backend conflict statuses map to the terms
the screens style by:

| Backend | View model |
|---|---|
| `pending` | `unresolved` |
| `awaiting_officer` | `pending_response` |
| `resolved_both` | `resolved` |
| `resolved_rejected` | `resolved` |

Severity maps `incompatible` → `high` and `conditional` → `medium`. Unknown
values fall back rather than rendering blank.

Each adapted object carries `_raw`, the original document.

## State — `src/context/`

Two contexts. Each is split into a value-only module and a provider component,
because a module exporting both breaks react-refresh.

| Context object | Provider |
|---|---|
| `auth-context.js` | `AuthContext.jsx` |
| `notification-context.js` | `NotificationContext.jsx` |

### AuthContext

Holds `user`, `loading` and `deptMap`. On boot it validates the stored token by
calling `GET /api/auth/me` rather than trusting `localStorage`. On success it
loads the department list and builds `deptMap`, the id → department index the
adapters use to resolve references.

`loadDepartments` tolerates failure and falls back to an empty map, in which
case adapters emit `null` department codes.

Sessions persist under `civiq_token` and `civiq_user`.

### NotificationContext

The single source of notification state for the whole application. The navbar
badge, the dropdown and the Notification Center all read from it, so one fetch
serves every consumer and the unread count cannot disagree between them.

The initial load fetches the list, the exact unread count and preferences in one
`Promise.all`. The count is fetched separately from the list because the list is
capped server-side at 50 records.

Live updates arrive over SSE and merge into the same state rather than a second
copy. Handled events: `notification.created`, `notification.read`,
`notification.read_all`, `notification.archived`, `notification.unarchived`,
`notification.deleted`, `notification.preferences_updated`. An unarchive triggers
a REST reload because it returns a row to the feed and the event carries only
ids.

Lifecycle actions (mark read, mark all read, archive, delete, save preferences)
are optimistic and revert on failure. The server also broadcasts each change,
which other tabs apply; the originating tab has already converged, so those
arrive as no-ops.

## Data fetching — `src/hooks/`

| Hook | Purpose |
|---|---|
| `useApi` | Runs an async loader, exposes `{ data, loading, error, reload, setData }` |
| `useAuth` | Session accessor; throws outside `AuthProvider` |
| `useResources` | Per-resource hooks built on `useApi` |
| `useNotificationCenter` | Notification state accessor |
| `useCnrWatchlist` | Locally stored complaint tracking references |
| `useSupervisorNav` | Supervisor navigation callback |

`useApi` guards state updates twice: a `cancelled` flag discards a superseded
request, and an `alive` ref blocks updates after unmount.

`useResources` exposes `useProjects`, `useProject`, `useConflicts`, `useConflict`,
`useComplaints`, `useComplaint`, `useUsers`, `useUser`, `useAuditLogs`,
`useDepartments`, `useNotifications`, the six `useDashboard*` hooks, and
`useCombined`.

`useNotifications` reads the shared notification state instead of issuing its own
request, keeping the `{ data, loading, error, reload }` shape the other hooks
expose.

## Routing — `src/router/AppRouter.jsx`

Routes are grouped by audience. `/admin`, `/officer` and `/supervisor` sit behind
`RoleRoute` and the shared `DashboardLayout`; citizen routes are public.

`RoleRoute` renders nothing while the session is being restored — an
unauthenticated first paint would bounce the user to `/login` on refresh — then
redirects to `/login` when there is no user, or to the role's own dashboard when
the role does not match.

Route guarding is a navigation concern only. The backend independently decides
what a user may read or write and is the sole authority.

`AdminMap` and `OfficerMap` are the only `lazy()` routes, wrapped in a single
`Suspense` boundary. They are the only consumers of Leaflet, so the GIS bundle
stays off the critical path for every other route.

## Components — `src/components/`

| Component | Role |
|---|---|
| `DashboardLayout` | Shell for authenticated roles; owns sidebar collapse and dark mode |
| `Navbar` | Page title, theme toggle, notification bell, account menu |
| `Sidebar` | Role-aware primary navigation |
| `Avatar` | Photo or initials, fixed size token set |
| `Card` | Project summary card |
| `AsyncState` | `LoadingState`, `ErrorState` and empty states |
| `PlaceholderPage` | Fallback for registered but unbuilt routes |
| `uiStyles.js` | Shared Tailwind class dictionaries |

Two sub-modules have their own barrels: `components/dashboard/` (charts,
sortable tables, filters, CSV export, formatters) and
`components/notifications/` (list, item, dropdown).

## GIS — `src/gis/`

Leaflet 1.9 with `leaflet.markercluster` and `leaflet.heat`. Detail:
[GIS.md](../features/GIS.md).

The module exposes a single public surface through `gis/index.js`; consumers
import from there rather than reaching into individual files.

## Pages — `src/pages/`

| Group | Screens |
|---|---|
| `admin/` | Dashboard, Projects, Project detail, Conflicts, Conflict detail, Map, Complaints, Complaint detail, Analytics, Audit, Users, User detail, Settings |
| `officer/` | Dashboard, Projects, Project detail, New project, Conflicts, Conflict detail, Clash respond, Complaints, Complaint detail, Map, Settings |
| `supervisor/` | Dashboard, Tasks, Task detail, Settings |
| `citizen/` | Home, Projects, Project detail, Report, Track, Not found, plus layout, header and footer |
| `auth/` | Login |
| `notifications/` | Notification Center |

Some registered routes render `PlaceholderPage` or a placeholder body rather
than a built screen. Each such file states this in its header comment.

## Build

Vite with `@vitejs/plugin-react`. The configuration is minimal: chunking is left
to Vite's defaults, which already separate the Leaflet-dependent map routes
because those are the only lazy imports.

Tailwind runs through PostCSS with autoprefixer. The theme is unextended —
colours are literal hex values at each call site, centralised for shared cases in
`components/uiStyles.js` and the `gis/*Styles.js` modules. Dark mode is
class-driven so `DashboardLayout` can toggle it.

## Testing

`node:test` with no test-framework dependency. `test/resolve-hook.mjs` appends
the file extensions Vite resolves implicitly but plain Node ESM does not; that
hook is the entire test tooling.

Covered: `test/gis.test.js` (coordinate validation, ordering conversions,
bounds, bounding box, distance) and `test/adapters.test.js` (view-model mapping,
redacted-reference handling, no-fabrication rule).

React component rendering is not tested.
