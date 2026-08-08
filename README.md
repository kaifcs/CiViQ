# CiViQ
### City Infrastructure Vision Intelligence Quotient

> Plan together. Build once.

A smart city infrastructure coordination platform for Indian municipalities.
Prevents clashes between departments before ground work begins.

## Quick Start

### Backend
```
cd backend && npm install
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
npm run seed              # optional demo data — DESTRUCTIVE, see below
npm run dev               # http://localhost:5000
```

`npm run seed` **deletes every notification, audit log, conflict, complaint,
project, user and department** in the database named by `MONGODB_URI` before
inserting its fixtures — all seven collections, not just the demo accounts.
Never point it at a database whose contents matter.

### Frontend
```
cd frontend && npm install
cp .env.example .env      # VITE_API_URL must point at the backend
npm run dev               # http://localhost:5173
```

## Public Portal

The application opens on a public, read-only transparency portal — no account
required. `/` and `/home` both render the landing page; `/projects` and
`/projects/:id` list and detail projects the city has approved, started,
finished or rescheduled. These are served by the unauthenticated
`GET /api/projects/public` and `GET /api/projects/public/:id`, which return a
whitelisted projection with no officer, supervisor, MCDM or conflict fields —
see [API](#api). Staff sign in at `/login`, reachable from the portal header's
"Staff Login" action, and are then routed to their role's dashboard.

## Quality Gates

Both halves expose the same four scripts, and `check` is what CI runs.

| Script | Backend | Frontend |
|---|---|---|
| `npm run lint` | ESLint | ESLint |
| `npm run build` | syntax check | Vite production build |
| `npm test` | 243 tests | 59 tests |
| `npm run check` | lint + build + test | lint + build + test |
| `npm run test:coverage` | with coverage report | with coverage report |

Tests use the Node.js built-in runner (`node:test`) — there is no test framework
dependency in either package. Backend integration tests need a MongoDB; they
**skip with a stated reason** when none is reachable, so `npm test` still works
on a machine without one. `.github/workflows/ci.yml` provides MongoDB as a
service so those tests always run in CI.

`TEST_MONGODB_URI` overrides the test database (default
`mongodb://127.0.0.1:27017/civiq_test_s5`). It is never read from `MONGODB_URI`,
and each test file gets its own database, dropped afterwards — the configured
development database is never touched.

## Demo Login
Created by `npm run seed`:

| Role | Email | Password |
|---|---|---|
| Admin | rajesh.kumar@civiq.in | civiq123 |
| Supervisor | suresh.singh@civiq.in | civiq123 |
| Supervisor | anjali.verma@civiq.in | civiq123 |
| Officer | amit.sharma@civiq.in | civiq123 |
| Officer | mohan.kumar@civiq.in | civiq123 |
| Officer | vinay.pandey@civiq.in | civiq123 |

The seed creates ten accounts in all — one admin, two supervisors and seven
officers, one per department. See `backend/src/seed/index.js` for the full list.

Seeded accounts carry a real Department reference, so their department resolves
in the UI and a seeded officer can create a project without naming one
explicitly. Accounts created through **Users → New user** behave identically.

**Account creation is administrator-only.** There is no public sign-up:
`POST /api/auth/register` requires an admin session and can create only
`officer` and `supervisor` accounts — promote to `admin` afterwards via
**Users → *user* → Role**. Because every account-creating path needs an existing
administrator, the first one comes from `npm run seed` in development, or a
direct database insert in production.

## Environment

**backend/.env** — required: `PORT`, `MONGODB_URI`, `JWT_SECRET`,
`JWT_EXPIRES_IN`. Validated at boot; the server exits if any is missing.
Also read: `NODE_ENV`, `CLIENT_URL`.

Optional, each degrading cleanly when absent:

| Variable | Effect when unset |
|---|---|
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Notifications persist and stream; no email is sent. |
| `REDIS_URL` | The notification stream stays process-local instead of fanning out across instances. |
| `TRUST_PROXY` | No proxy is trusted. Set it to the proxy hop count when running behind one, or `req.ip` — and therefore rate limiting and the audit trail's recorded address — resolves to the proxy rather than the caller. |

**frontend/.env** — `VITE_API_URL` (e.g. `http://localhost:5000/api`).

## API

Interactive documentation is served by the backend itself:

- `GET /api/docs` — Swagger UI
- `GET /api/docs.json` — OpenAPI 3.0.3 document
- `GET /api/health` — liveness, database state and subsystem diagnostics

52 paths / 62 operations across auth, config, departments, users, projects,
conflicts, complaints, notifications, audit and dashboard. Authentication is
Bearer JWT; authorization is role-based and, for projects, ownership-scoped.

There are exactly three roles — `admin`, `officer` and `supervisor`. **There is
no citizen account type**: every citizen surface is unauthenticated, so a
resident never signs in. Those public routes are `GET /api/projects/public`,
`GET /api/projects/public/:id`, `GET /api/config/wards`, `GET /api/complaints`,
`GET /api/complaints/:id`, `GET /api/complaints/stats` and
`POST /api/complaints`. The complaint reads are redacted for an unauthenticated
caller — see [Citizen complaints](#citizen-complaints).

**Errors are uniform.** Every failure returns:

```
{ success: false, error: { code, message, details? }, message }
```

`message` is repeated at the top level so both historical error shapes remain
valid subsets, and `error.code` is a stable identifier suitable for branching.

**Success payloads are not uniform.** Auth, departments, users and dashboard
wrap in `{ success, ... }`; projects, conflicts, complaints, audit and
notifications return the raw document or array, which the frontend adapters
read directly. The spec documents this as-is — converging it would break every
existing consumer.

## Citizen complaints

The portal carries a complete public complaint workflow, with no account at any
step:

- `/complaints/new` — the intake form. Issue type and description are required,
  and the location is placed by clicking the map, because `location.coords` is
  required by the schema. Ward is selected from `GET /api/config/wards`, so a
  reported ward always matches the register the backend reasons about. On
  success the server-generated **CNR** is shown; the confirmation appears only
  from a 201, never optimistically.
- `/complaints/track?cnr=…` — lookup by reference number.
  `GET /api/complaints/:id` accepts a CNR in place of an id. The screen shows
  the status timeline and the reporter's own description.

`POST /api/complaints` accepts only reporter fields — issue type, description,
location and photo URL — so workflow state, status and assignment cannot be set
from the public form. It is rate-limited to 10 submissions per hour.

Complaint reads are **redacted for an unauthenticated caller**:
`assignedOfficer`, `assignedDepartment`, `photoUrl`, `resolutionNote`,
`location.coords` and `location.address` are omitted, and `location.ward` is
kept. The tracking screen therefore shows no handling detail, and says so rather
than rendering the missing fields as empty.

## GIS

Map functionality lives in `frontend/src/gis` and is built on Leaflet. Its
consumers — the map routes, the detail screens, the project wizard and the
citizen complaint form — all load lazily, so the GIS bundle stays off the
critical path for every other screen.

**Primitives**
- `MapContainer` — map lifecycle, resize handling, view synchronisation
- `MarkerLayer` — clustered point rendering
- `GeoJSONLayer` — stored line/polygon geometry
- `LocationMap` — read-only single-record map for the detail screens
- `PopupCard` — shared read-only popup shell
- `coordinates` / `geojson` / `gisService` — validation, conversion, bounds, record adapters

**Authoring** — the only writers of stored geometry:
- `PointPicker` — click or drag to set one coordinate. Backs the complaint
  form's location and the project wizard's `centerCoords`.
- `GeometryEditor` + `geometryModes` — click to add vertices, building a
  `LineString` or `Polygon` for `Project.location.geoJSON`. Both go through the
  constructors in `geojson.js`, which own `[lng, lat]` ordering and ring
  closure, and emit `null` until the shape is valid — so a half-drawn outline is
  never persisted, and a project with no shape stores no geometry at all.

Geometry is drawn on the Location step of the project wizard and persists
through the ordinary `POST`/`PUT /api/projects` routes; `location` is
whitelisted as a whole, so no new endpoint is involved. An edit re-opens the
saved shape rather than starting blank.

**Layers** — independently toggleable; stacking order is centralised in `gis/config.js`.

| Layer | Renders | Source |
|---|---|---|
| Heatmap | density surface | project / complaint coordinates |
| Utility | pipeline & corridor geometry | `Project.location.geoJSON` |
| Department | department-owned assets | `Project` + `Department.color` |
| Project | project markers | `Project.location.centerCoords` |
| Complaint | complaint markers | `Complaint.location.coords` |
| Conflict | connectors between clashing projects | `Conflict` + both endpoints |

Layers render only geometry the backend stores. Records without coordinates are
skipped rather than placed at an invented position.

The admin shell targets desktop widths (≥1024px). Its sidebar collapses to an
icon rail, but the layout is not designed for narrow viewports, so the map has
little room below that width.

## Project Structure

```
.github/workflows/   CI: lint, build and test for both halves
backend/
  server.js          process lifecycle: env validation, connections, listen, shutdown
  src/
    app.js           the Express pipeline (middleware order, routes, error chain)
    config/          env validation, DB and optional Redis connections, static tuning constants
    controllers/     request handling per module
    services/        clash detection, MCDM scoring, analytics, audit, notifications
    models/          Mongoose schemas
    routes/          Express routers (auth guards applied here)
    middleware/      auth, ownership scoping, request correlation, error handling, 404
    utils/           validators, pagination, tokens, response helpers, logger, serializers
    openapi/         OpenAPI specification
    seed/            demo data (destructive — see the header in seed/index.js)
  test/
    unit/            hermetic tests; no database required
    integration/     API, notification feed and clash detection against MongoDB
    helpers/         response doubles, fixtures, per-file test database
frontend/
  test/              GIS primitives and adapter tests, plus the ESM resolve hook
  src/
    gis/             GIS module (primitives, layers, styles, configuration)
    services/        API layer and backend -> view-model adapters
    hooks/           data-fetching hooks
    context/         authentication, notification state
    pages/           admin / officer / supervisor / citizen screens
    components/      shared UI
      dashboard/     dashboard module (charts, tables, filters, formatters)
      notifications/ notification list, item and navbar dropdown
      uiStyles.js    Tailwind class dictionaries shared by list/detail screens
```

## Shared Frontend Modules

Four modules hold everything that would otherwise be redeclared per screen.
Add to these rather than reintroducing a local copy.

| Module | Owns |
|---|---|
| `components/dashboard` | charts, sortable tables, filters, CSV export, date/number formatters, status **labels** |
| `components/uiStyles` | status, department, type and role **Tailwind classes** |
| `components/notifications` | notification list, item and dropdown, all reading the shared notification state |
| `gis/` | map primitives, layer styles, marker **colours** |

Labels, classes and colours live apart deliberately: the dashboard vocabulary
follows the adapter view-models, while the GIS palette drives map rendering.

## Notifications

Eight business events raise notifications: project approved, rejected, assigned
and completed, clash detected, complaint assigned and status changed, and role
changed. `Notification.type` is a closed enum of nine values — `early_completion`
is defined and reserved but has no producer yet. `category` and `priority` are
derived from it in `backend/src/config/notificationTypes.js`, so a given event
is always classified the same way.

`notificationService` is the only writer and the only reader — controllers hold
no notification queries. It is also the single place that decides delivery:

```
business operation -> persistence -> preference evaluation -> in-app / email
```

Persistence is never gated on preferences, so history stays complete even for a
muted category. Delivery resolves the recipient once and drives both channels
from that single lookup.

| Endpoint | Purpose |
|---|---|
| `GET /api/notifications` | Recipient's feed. Bare array, capped at 50 unless `?page`/`?limit`. Excludes archived and muted categories by default; `?archived`, `?includeMuted` and `?search` override. |
| `GET /api/notifications/unread-count` | Exact badge count, unaffected by the list cap. |
| `GET /api/notifications/:id` | One notification. |
| `PATCH /api/notifications/:id/read`, `PATCH`/`PUT /read-all` | Mark read. PUT is a legacy alias. |
| `PATCH /api/notifications/:id/archive`, `/unarchive`, `DELETE /:id` | Lifecycle. Archive is reversible; delete is final. |
| `PATCH /bulk-archive`, `/bulk-unarchive`, `DELETE /bulk-delete` | Bulk lifecycle, capped at 200 ids and authorized per id. |
| `GET`/`PATCH /api/notifications/preferences` | Per-channel, per-category opt-outs. `system` cannot be disabled. |
| `POST /api/notifications/stream-ticket` | 30-second single-use ticket for the stream. |
| `GET /api/notifications/stream` | SSE feed, authenticated by ticket. |

Every query is scoped to the authenticated recipient, so ownership is enforced
by the filter itself. Another user's notification returns 404 rather than 403,
and admins are not exempt.

**Email (Brevo).** Optional: without `BREVO_API_KEY` the app runs and
notifications still persist. The notification row doubles as the retry queue —
`deliveryStatus`, `retryCount` and `nextAttemptAt` — so no broker is involved.
Sending is claimed atomically, which is what prevents a duplicate send when
several instances sweep at once. 429 and 5xx retry with backoff; other 4xx are
permanent.

**Real time.** `EventSource` cannot set headers, so the stream is opened with a
short-lived single-use ticket rather than the session JWT. Because that ticket
cannot be replayed, the client reconnects by requesting a new one. With
`REDIS_URL` set, events fan out across instances; without it the hub is
process-local and behaves identically for a single instance. Missed events are
recovered by re-reading over REST — there is no server-side replay queue.

On the frontend a single `NotificationProvider` owns the state; the navbar
badge, the dropdown and the Notification Center (`/{role}/notifications`) all
read it through `useNotificationCenter`, so one fetch serves every surface and
the unread count cannot disagree between them.

The Notification Center has an **Archived** view, reached from the header, with
per-row and bulk **Restore** alongside Delete. The provider deliberately holds
only the default feed — which excludes archived rows — so the archived list is a
separate `?archived=true` read through the same service method, re-run whenever
a row crosses the archived boundary, including from another tab via the stream.

## Known Limitations

Things the system genuinely does not do. Each is a missing data source or an
undefined requirement, not an unfinished screen.

**Two MCDM criteria are not measured.** `populationImpact` (21% of the weight)
and `economicValue` (3%) have no data source: there is no ward population
register, no benefit valuation, and neither is collected from the officer. The
engine assigns both the neutral mid-scale value for every project, so they
separate no two projects and change no ranking — the outcome is decided by the
five criteria that are computed. They are shown in the UI with their weight and
labelled *not measured*, and their bars stay empty, so the constant is never
presented as a measurement. Inventing figures would corrupt 24% of the weight
with fabricated data, and the weights are not adjusted to hide the gap.

**Complaints have no deadline model.** There is no due date, target date or SLA
on `Complaint`, so an overdue state cannot be derived. The adapter previously
emitted a constant `overdue: false`, which made the overdue treatment on the
complaint screens permanently unreachable; the field and that treatment were
removed rather than left showing a value nothing supports. Elapsed time since
filing is still shown. Adding overdue means first deciding what a deadline is —
a policy question, not a code change.

**Some fields are API-only.** `documents[]`, `parentProject` and `phaseNumber`
(projects) and `photoUrl` (complaints) are legitimate domain fields, writable
and readable through the API and documented in the OpenAPI spec, but no screen
reads or writes them. `documents[]` and `photoUrl` would both need a file
upload and storage service that this deployment does not have; building one
only to consume the field would be speculative. They are retained on the API,
not removed — but the complaint adapter carries no `photos` projection for
`photoUrl`, because a view model field nothing renders is dead weight, the same
reason `overdue` was removed. `photoUrl` stays reachable through `_raw`.
`avatar` (users) *is* consumed, by `Avatar`, and is set through the API rather
than an upload UI.

**One notification type has no producer.** `Notification.type` is a closed enum
of nine values; `early_completion` is defined and reserved but nothing raises
it.

**The admin shell is desktop-only.** It targets widths ≥1024px. The sidebar
collapses to an icon rail, but the layout is not designed for narrow viewports.

## Tech Stack

**Frontend** — React 19, Vite 8, Tailwind CSS 3, React Router 7, Axios,
Leaflet 1.9 (+ markercluster, heat)

**Backend** — Node.js, Express 4, MongoDB, Mongoose 8, JWT, bcryptjs, Helmet,
CORS, compression, rate limiting, Swagger UI, Redis (optional)

Email uses the Brevo REST API through the native `fetch`; there is no provider
SDK, SMTP client or job-queue dependency.
