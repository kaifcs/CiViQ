# Backend Architecture

Express 4 on Node.js with Mongoose 8. Layered as routes → middleware →
controllers → services → models, with shared utilities underneath.

## Module responsibilities

| Layer | Location | Holds | Does not hold |
|---|---|---|---|
| Routes | `src/routes/` | Path-to-handler binding, guard composition | Business logic |
| Middleware | `src/middleware/` | Authentication, authorization, correlation, errors | Domain rules |
| Controllers | `src/controllers/` | Request parsing, input validation, response shaping | Aggregation, scoring, delivery |
| Services | `src/services/` | Domain logic and orchestration | HTTP concerns |
| Models | `src/models/` | Schema, indexes, hooks | Query composition |
| Utilities | `src/utils/` | Cross-cutting helpers | Domain rules |

## Bootstrap

`server.js` runs `validateEnv()` before requiring `src/app.js`, so a missing
variable is reported before any other module initialises. It then connects
MongoDB, attempts Redis, subscribes the SSE hub to Redis, starts the email retry
worker and listens.

`src/app.js` builds and exports the Express application. It starts no listener
and opens no connection, which is what allows the complete middleware chain to
be exercised by the integration tests.

Shutdown on `SIGINT` or `SIGTERM` stops the retry worker and waits for any
in-flight sweep, releases every open SSE connection, then closes the HTTP
server, Redis and MongoDB. Streams must be released first because `server.close()`
waits for every connection to end and SSE connections are long-lived by design.

## Configuration — `src/config/`

| Module | Responsibility |
|---|---|
| `env.js` | Validates `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `MONGODB_URI`; logs the missing names and exits |
| `db.js` | `connectDB` / `disconnectDB`; connection events routed through the logger |
| `redis.js` | Publisher/subscriber pair; bounded retry, then disabled for the process lifetime |
| `notificationTypes.js` | Notification vocabulary and the type → category/priority mapping |
| `notificationLinks.js` | Where a notification points, per recipient role |
| `staticConfig.js` | Domain constants for clash detection and MCDM |

`redis.js` uses a `reconnectStrategy` that returns an `Error` after two attempts.
An unreachable Redis is therefore disabled once rather than reconnecting
indefinitely and flooding the logs.

## Middleware — `src/middleware/`

| Module | Exports | Behaviour |
|---|---|---|
| `auth.js` | `protect`, `authorize` | `protect` verifies the Bearer token, re-reads the user, rejects inactive accounts, attaches `req.user`; `authorize(...roles)` gates by role |
| `ownership.js` | `projectScopeFilter`, `canAccessProject`, `requireProjectAccess` | Project visibility as a Mongo filter, a predicate and a route guard |
| `requestContext.js` | `requestContext`, `SLOW_REQUEST_MS` | Correlation id, response timing, async-storage scope |
| `error.js` | default export | Terminal error handler; the four-parameter signature is required by Express |
| `notFound.js` | default export | JSON 404 for unmatched routes |

`protect` re-reads the user from the database on every request rather than
trusting the token payload. That costs one lookup and means a deactivated or
deleted account loses access immediately rather than when its token expires. The
password hash is excluded at the query.

An expired token is reported distinctly from an invalid one, so a client can
distinguish a routine timeout from a credential failure.

`error.js` emits a stack trace only when `NODE_ENV === "development"`. A
non-string `err.code` — such as the numeric `11000` from the MongoDB driver —
falls back to `INTERNAL_ERROR`, keeping the emitted code a string.

`requestContext` accepts an inbound `X-Request-Id` only when it matches
`^[A-Za-z0-9._-]{8,64}$`, so log entries cannot be forged, and generates a UUID
otherwise. The id is echoed on the response.

## Controllers — `src/controllers/`

| Controller | Resource | Notes |
|---|---|---|
| `authController` | `/api/auth` | Uniform failure message for unknown email and wrong password; `updateProfile`/`changePassword` are self-service, always scoped to `req.user`, and independent of `usersController`'s admin-only writes |
| `projectsController` | `/api/projects` | Orchestrates MCDM, clash detection, notifications and audit on create; `getPublicProjects`/`getPublicProject` serve the unauthenticated `/public` routes through `serialisePublicProject` |
| `conflictsController` | `/api/conflicts` | Two-stage resolution; every response passes through `serialiseConflict` |
| `complaintsController` | `/api/complaints` | Whitelisted writable fields; `:id` accepts an ObjectId or a CNR ID; unpaginated reads capped at 200 records because the list is public; `/stats` delegates to `analyticsService` |
| `usersController` | `/api/users` | Admin only; role change and deactivation notify the affected user |
| `departmentController` | `/api/departments` | Admin writes, authenticated reads |
| `notificationsController` | `/api/notifications` | Recipient-scoped; bulk operations capped at 200 ids |
| `auditController` | `/api/audit` | Read-only; unpaginated reads capped at 200 records |
| `dashboardController` | `/api/dashboard` | Thin pass-through to `analyticsService` |

`dashboardController` wraps each analytics function in a shared `handler`. The
service reports an invalid filter by returning `{ error }` rather than throwing,
so a bad query becomes a 400 while a genuine fault becomes a 500.

Writable fields are whitelisted through the shared `utils/writableFields`
helper, so a field added to a schema later is not client-writable by accident.
`projectsController` and `complaintsController` both apply it.

`complaintsController` whitelists writable fields (`issueType`, `description`,
`location`, `photoUrl`, `status`, `resolutionNote`, `assignedDepartment`,
`assignedOfficer`), so a field added to the schema later is not client-writable
by accident.

## Services — `src/services/`

| Service | Responsibility |
|---|---|
| `clashDetection` | Candidate selection and the geographic, temporal and work-type tests |
| `mcdmEngine` | Seven-criteria weighted scoring |
| `analyticsService` | Every dashboard figure, as faceted aggregation pipelines |
| `notificationService` | Sole writer and reader of notifications; all delivery decisions |
| `notificationPreferences` | Whether a channel should receive a given notification |
| `notificationStream` | SSE transport and Redis fan-out |
| `emailService` | Brevo transport |
| `emailTemplates` | Email rendering |
| `emailRetryWorker` | Periodic sweep of notifications due for another send |
| `auditService` | Sole writer of the audit trail |

### Analytics

`analyticsService` issues one `$facet` pipeline per collection, so a dozen counts
and groupings cost one round trip, and queries independent collections
concurrently with `Promise.all`. Enum values are read from the schemas rather
than restated, so a new status appears in results automatically and a removed one
cannot linger.

Filters are not uniform across collections: ward lives at a different path per
model, and the project and complaint status enums are disjoint, so one `status`
value cannot serve both. `toComplaintMatch` performs that translation.

`getDepartmentAnalytics` runs three grouped reads and merges them in memory over
the number of departments rather than the number of documents.

### Email delivery state machine

The `Notification` document is the queue; no broker or second collection is
involved.

| `deliveryStatus` | Meaning |
|---|---|
| `pending` | Not yet attempted, or awaiting retry |
| `sending` | Claimed by a worker |
| `delivered` | Accepted by the provider |
| `failed` | Permanently rejected, or out of attempts |
| `skipped` | Email disabled, or suppressed by preferences |

`claimForSend` uses `findOneAndUpdate` with a `deliveryStatus: "pending"` guard.
Exactly one caller can move a row out of `pending`, so repeated sweeps and
concurrent instances cannot produce a duplicate send.

Retries run to a maximum of 4 attempts with delays of 60 s, 300 s and 900 s.
`emailRetryWorker` sweeps every 60 s in batches of 25, guards against
overlapping passes, and does nothing when email is not configured. Its interval
is `unref`'d so it can never be the reason the process stays alive.

`emailService.isRetryableStatus` treats 429 and any 5xx as transient; other 4xx
responses are permanent, because retrying would resend the same rejected payload.

## Utilities — `src/utils/`

| Module | Exports |
|---|---|
| `apiResponse.js` | `ERROR_CODES`, `fail`, `badRequest`, `invalidId`, `unauthorized`, `forbidden`, `notFound`, `conflictError`, `serverError`, `sendWriteError` |
| `logger.js` | `logger`, `runWithContext`, `currentContext`, `scrub`, `LEVELS` |
| `pagination.js` | `parsePagination`, `setPaginationHeaders`, `DEFAULT_LIMIT`, `MAX_LIMIT` |
| `serializers.js` | `serialiseConflict`, `serialiseConflicts`, `redactProjectRef`, `serialiseComplaint`, `serialiseComplaints` |
| `streamTicket.js` | `issueTicket`, `consumeTicket`, `consumedCount`, `TICKET_TTL_SECONDS` |
| `token.js` | `generateToken`, `verifyToken` |
| `validators.js` | `validateRegisterInput`, `validateLoginInput`, `EMAIL_REGEX`, `CREATABLE_ROLES` |
| `refValidators.js` | `validateDepartmentRef`, `validateUserRef`, `STAFF_ROLES` |
| `writableFields.js` | `pickWritable` — the shared write whitelist |
| `asyncHandler.js` | Forwards a rejected promise to the error middleware |

The 409 helper is named `conflictError`, not `conflict`, because
`conflictsController` holds a local `conflict` document that a bare `conflict`
import would shadow.

`refValidators` exists because Mongoose validates that a reference is a
well-formed ObjectId but never that the document exists. Both validators also
require the referenced record to be active.

## Response contract

Every failure emits one shape:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] },
  "message": "..."
}
```

`message` is duplicated at the top level so both historical shapes — `{ message }`
and `{ success, message }` — remain valid subsets of it. `details` is omitted
when `NODE_ENV=production`.

Success payloads are deliberately not uniform. Auth, departments, users and
dashboard wrap in `{ success, ... }`; projects, conflicts, complaints, audit and
notifications return the document or a bare array.

`sendWriteError` translates Mongoose write failures: duplicate key (`11000`)
becomes 409 `DUPLICATE_RESOURCE`, a `ValidationError` becomes 400
`VALIDATION_ERROR`, a `CastError` becomes 400 `VALIDATION_ERROR` carrying only
the rejected path name, anything else becomes 500.

## Pagination

Opt-in through `?page` and/or `?limit`. The default limit is 25 and the maximum
is 200.

When neither parameter is supplied, most list endpoints return the full list —
but four cap the read rather than growing without bound:

| Endpoint | Cap without `?page`/`?limit` | Why |
|---|---|---|
| `GET /api/complaints` | 200 | The one public list in the API |
| `GET /api/projects/public` | 200 | Unauthenticated, so it cannot be unbounded |
| `GET /api/audit` | 200 | The trail grows without bound |
| `GET /api/notifications` | 50 | The default feed |

Every other list endpoint — `GET /api/projects`, `/api/conflicts`,
`/api/departments`, `/api/users` — is authenticated, scoped to the caller, and
genuinely returns everything in scope when unpaginated. See
[`API_REFERENCE.md`](../api/API_REFERENCE.md) for the per-endpoint detail.

All four capped endpoints send `X-Total-Count` on **every** response, paginated
or not, so a truncated read is never mistaken for a complete one: compare the
header against the array length. `GET /api/complaints`,
`GET /api/projects/public` and `GET /api/audit` sort `-createdAt` with no way to
change it, so truncation there keeps the newest records. `GET /api/notifications`
defaults to that order but honours `sortBy` (`createdAt`, `priority`, `read`) and
`order`, so its cap keeps the first 50 of the requested ordering rather than
always the newest.

Metadata travels in headers because several list endpoints return a bare array,
and moving it into the body would be a breaking change: `X-Total-Count`,
`X-Page`, `X-Limit`, `X-Total-Pages`, `X-Has-Next`, `X-Has-Previous`. The full
set is sent only when pagination is on; a capped unpaginated read sends
`X-Total-Count` alone, there being no page to describe.

In `projectsController.getProjects` the count runs concurrently with the read
under `Promise.all`, so pagination costs one round trip rather than two.

## Testing

`node:test`, with no test-framework dependency.

| Suite | Location | Requires |
|---|---|---|
| Unit | `test/unit/` | Nothing |
| Integration | `test/integration/` | MongoDB |

Unit suites cover `apiResponse`, `errorMiddleware`, `logger`,
`notificationLinks`, `notificationPreferences`, `notificationStream`,
`ownership`, `pagination`, `seedAuditActions`, `seedCredentials`, `serializers`
and `streamTicket`. Integration suites cover the HTTP API, the notification feed
query and clash detection.

`seedAuditActions` and `seedCredentials` read `src/seed/index.js` as TEXT rather
than importing it — the seeder runs on load and empties the database.

Integration tests skip with a stated reason when no database is reachable.
`test/helpers/db.js` derives a database name per test file, because the runner
executes files concurrently in separate processes and a shared database would let
one file's teardown delete another's fixtures. Each database is dropped
afterwards, and index builds are awaited first so the drop is not undone by a
build still in flight. `TEST_MONGODB_URI` is read instead of `MONGODB_URI`, so
the configured database is never touched.

`test/helpers/http.js` provides request and response doubles;
`test/helpers/fixtures.js` provides deterministic document builders.
