# System Architecture

CIVIQ is a municipal infrastructure coordination platform for Ghaziabad, Uttar
Pradesh. It detects and resolves scheduling and spatial collisions between
public works, prioritises projects with a weighted decision model, and handles
citizen-reported issues.

## Composition

Two independently deployable applications sharing one MongoDB database.

| Component | Stack | Entry point |
|---|---|---|
| Backend | Node.js, Express 4, Mongoose 8 | `backend/server.js` |
| Frontend | React 19, Vite 8, Tailwind 3, React Router 7 | `frontend/src/main.jsx` |
| Database | MongoDB | `backend/src/config/db.js` |
| Cross-instance fan-out | Redis (optional) | `backend/src/config/redis.js` |
| Email | Brevo REST API (optional) | `backend/src/services/emailService.js` |

The backend is the sole authority for data and authorization. The frontend holds
no business rules; screens render view models produced by
`frontend/src/services/adapters.js`.

## Process and pipeline separation

`backend/server.js` owns the process: environment validation, MongoDB and Redis
connections, the email retry worker, listening and graceful shutdown.

`backend/src/app.js` owns the request pipeline and exports the assembled Express
application without starting a listener.

## Request lifecycle

Middleware order in `src/app.js` is load-bearing.

| Order | Middleware | Responsibility |
|---|---|---|
| 1 | `requestContext` | Assign or accept `X-Request-Id`; open async-storage scope; time the request |
| 2 | `helmet` | Security headers |
| 3 | `cors` | Restricted to `CLIENT_URL` |
| 4 | `compression` | Response compression |
| 5 | `express.json`, `express.urlencoded` | Body parsing |
| 6 | `morgan` | HTTP access logs, written through the structured logger |
| 7 | `rateLimit` on `/api` | 1000 requests / 15 min; skips `/notifications/stream` |
| 8 | `rateLimit` on `/api/notifications/stream` | 30 requests / min |
| 9 | `rateLimit` on the credential routes | 20 **failed** attempts / 15 min |
| 10 | `rateLimit` on `POST /api/complaints` | 10 requests / hour; matched on method and path |
| 11 | Routers | `/api/health`, `/api` (docs), and ten resource routers |
| 12 | `notFound` | JSON 404 for unmatched routes |
| 13 | `errorHandler` | Terminal error envelope |

Correlation runs first so every later log line — including Morgan's — carries the
request id. The 404 and error handlers are registered last, in that order.

The stream limiter is separate because one SSE connection is a single long-lived
request, while a flapping network reconnects repeatedly; counting reconnects
against the general quota would drain a user's ordinary API allowance.

## Authorization layers

Three layers apply in sequence, each answering a different question.

| Layer | Module | Question |
|---|---|---|
| Authentication | `middleware/auth.js` → `protect` | Who is the caller? |
| Role (RBAC) | `middleware/auth.js` → `authorize(...roles)` | May this role use this endpoint? |
| Ownership | `middleware/ownership.js` → `requireProjectAccess` | May this user touch this record? |

A fourth control operates on responses rather than requests:
`utils/serializers.js` reapplies project visibility to conflict payloads, which
embed two project references.

Detail: [AUTHORIZATION.md](../features/AUTHORIZATION.md).

## Data flow

### Project creation

1. `POST /api/projects` — `protect`, `authorize("officer", "admin")`
2. `projectsController.createProject` validates the department reference, the
   optional project-manager reference and the date range
3. `services/mcdmEngine.calculateMCDM` scores the project across seven criteria
4. `Project.create` persists the record; a pre-save hook assigns `projectId`
5. `services/clashDetection.detectClashes` selects candidates and applies the
   geographic, temporal and work-type tests
6. For each clash a `Conflict` is created or reused, then `hasClash` and
   `clashes` are rewritten on **both** projects from the Conflict collection —
   so the project already holding the ground records the collision too
7. `services/notificationService.createNotifications` notifies the submitting
   officer and, where different, the officer owning the clashing project
8. `services/auditService.recordAudit` records `project_created`
9. Response: `{ project, mcdm, clashesDetected }`

### Conflict resolution

1. `PUT /api/conflicts/:id/resolve` — admin only, and only while the conflict is
   `pending`. `approve_both` sets both projects to `approved`; `reject_lower`
   sets the lower-scoring project to `rescheduled` with a `suggestedDate` and
   moves the conflict to `awaiting_officer`
2. `PUT /api/conflicts/:id/respond` — officer only, and only the officer who owns
   the rescheduled project. `accept` takes the suggested date; `custom` proposes
   a date on or after it
3. Clash detection re-runs against the new date before the project is saved;
   `recheckPassed` records whether the result is clear

### Notification delivery

Persist, resolve the recipient once, evaluate preferences, then publish to the
SSE hub and queue email independently. Detail:
[NOTIFICATIONS.md](../features/NOTIFICATIONS.md).

## Observability

`utils/logger.js` emits one JSON object per line when `NODE_ENV=production` and
readable output otherwise. Levels are `fatal`, `error`, `warn`, `info`, `debug`;
the active level is derived from `NODE_ENV` rather than a separate variable.

Redaction is applied to every log line, both by key pattern
(`pass(word)?|secret|token|api[-_]?key|authorization|cookie|jwt|credential`) and
by value pattern — MongoDB and Redis URIs carrying credentials, `Bearer` tokens,
and `token=` / `ticket=` query parameters.

Correlation is held in `AsyncLocalStorage`, which is what allows the notification
service, email service, SSE hub and audit writer to emit correlated log lines
without any change to their signatures. Requests taking 1000 ms or longer are
logged as `Slow request`.

## Optional infrastructure

Both subsystems degrade without failing.

| Subsystem | Behaviour when absent |
|---|---|
| Redis | The SSE hub stays process-local; single-instance delivery is unaffected |
| Brevo | Notifications persist and stream; email delivery is recorded as `skipped` |

`GET /api/health` reports each as `connected`, `configured` or `disabled`, and
never exposes a host, URI or credential.

## Repository layout

```
.github/workflows/   CI: lint, build and test for both applications
backend/
  server.js          process lifecycle
  src/
    app.js           Express pipeline
    config/          env validation, MongoDB, Redis, notification vocabulary, domain constants
    controllers/     request handling, one module per resource
    middleware/      auth, ownership, request correlation, error, 404
    models/          Mongoose schemas
    openapi/         OpenAPI 3.0.3 specification
    routes/          Express routers; guards applied here
    seed/            development fixtures (destructive)
    services/        clash detection, MCDM, analytics, notifications, email, audit
    utils/           response helpers, logger, pagination, tokens, validators, serializers
  test/
    unit/            hermetic; no database required
    integration/     require MongoDB
    helpers/         response doubles, fixtures, per-file test database
frontend/
  src/
    components/      shared UI, plus the dashboard/, notifications/ and public/ modules
    context/         authentication and notification state
    gis/             map primitives, layers and styles
    hooks/           data-fetching hooks
    pages/           admin, officer, supervisor, citizen, auth, notifications
    router/          route table and session guard
    services/        API client and adapters
  test/              GIS and adapter tests, plus the ESM resolve hook
docs/                this documentation set
```

## Dependency constraints

The backend has no test framework, HTTP client or email SDK. Tests run on the
Node.js built-in runner (`node:test`); Brevo is reached through the global
`fetch`. The frontend's runtime dependencies are `axios`, `react`, `react-dom`,
`react-router-dom`, `leaflet`, `leaflet.heat` and `leaflet.markercluster`.
