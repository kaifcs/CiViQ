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
npm run seed              # optional: demo users and complaints
npm run dev               # http://localhost:5000
```

### Frontend
```
cd frontend && npm install
cp .env.example .env      # VITE_API_URL must point at the backend
npm run dev               # http://localhost:5173
```

## Quality Gates

Both halves expose the same four scripts, and `check` is what CI runs.

| Script | Backend | Frontend |
|---|---|---|
| `npm run lint` | ESLint | ESLint |
| `npm run build` | syntax check | Vite production build |
| `npm test` | 187 tests | 40 tests |
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

47 paths / 57 operations across auth, departments, users, projects, conflicts,
complaints, notifications, audit and dashboard. Authentication is Bearer JWT;
authorization is role-based (`admin`, `officer`, `supervisor`, `citizen`) and,
for projects, ownership-scoped.

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

## GIS

Map functionality lives in `frontend/src/gis` and is built on Leaflet. The map
routes are its only consumers and load lazily, so the GIS bundle stays off the
critical path for every other screen.

**Primitives**
- `MapContainer` — map lifecycle, resize handling, view synchronisation
- `MarkerLayer` — clustered point rendering
- `GeoJSONLayer` — stored line/polygon geometry
- `PopupCard` — shared read-only popup shell
- `coordinates` / `geojson` / `gisService` — validation, conversion, bounds, record adapters

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

## Tech Stack

**Frontend** — React 19, Vite 8, Tailwind CSS 3, React Router 7, Axios,
Leaflet 1.9 (+ markercluster, heat)

**Backend** — Node.js, Express 4, MongoDB, Mongoose 8, JWT, bcryptjs, Helmet,
CORS, compression, rate limiting, Swagger UI, Redis (optional)

Email uses the Brevo REST API through the native `fetch`; there is no provider
SDK, SMTP client or job-queue dependency.
