# Deployment

Two deployable units: a Node.js API server and a static frontend bundle.

## Requirements

| Component | Requirement |
|---|---|
| Node.js | 24 — the version CI installs. No `engines` field is declared |
| MongoDB | Reachable from the backend. CI uses MongoDB 7 |
| Redis | Optional |
| Brevo account | Optional |

The backend uses the global `fetch` and the built-in `node:test` runner, both of
which require a modern Node runtime.

## Environment variables

### Backend — `backend/.env`

Validated at startup by `src/config/env.js`. A missing required variable is
logged with the names that are absent, and the process exits with code 1.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | yes | Listen port. `server.js` falls back to 5000 if unset, but validation rejects an unset value first |
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Signs session tokens and SSE stream tickets |
| `JWT_EXPIRES_IN` | yes | Session token lifetime, e.g. `7d` |
| `NODE_ENV` | no | `production` switches on JSON logging and suppresses error detail |
| `CLIENT_URL` | no | CORS origin and email link base. Defaults to `http://localhost:5173` |
| `BREVO_API_KEY` | no | Enables email |
| `MAIL_FROM_EMAIL` | no | Required alongside `BREVO_API_KEY` for email to be enabled |
| `MAIL_FROM_NAME` | no | Sender display name. Defaults to `CiViQ` |
| `REDIS_URL` | no | Enables cross-instance fan-out. Defaults to `redis://127.0.0.1:6379` when Redis is attempted |
| `TEST_MONGODB_URI` | no | Test database only. Defaults to `mongodb://127.0.0.1:27017/civiq_test_s5` |

Email is enabled only when **both** `BREVO_API_KEY` and `MAIL_FROM_EMAIL` are
set.

`NODE_ENV` controls three behaviours: log format (JSON when `production`), log
level (`info` when `production`, `debug` otherwise), and error detail —
validation `details` and server error text are suppressed in production, and
stack traces appear only when `NODE_ENV=development`.

### Frontend — `frontend/.env`

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | yes | Backend base URL including `/api`. Defaults to `http://localhost:5000/api` |

Vite inlines this at build time, so a change requires a rebuild.

## Degradation

Both optional subsystems fail closed without stopping the application.

| Subsystem | Absent | Effect |
|---|---|---|
| Redis | `REDIS_URL` unreachable | The SSE hub stays process-local. Single-instance delivery is unaffected; multi-instance deployments deliver only to the instance holding the connection |
| Brevo | Credentials unset | Notifications persist and stream. Email delivery is recorded as `skipped`; nothing fails |

Redis connection uses a bounded retry — two attempts with a 2-second connect
timeout — after which it is disabled for the lifetime of the process rather than
reconnecting indefinitely.

## Startup sequence

`backend/server.js`:

1. `dotenv.config()`
2. `validateEnv()` — exits on a missing required variable
3. Require `src/app.js`
4. `connectDB()`
5. `connectRedis()` — resolves `false` when unreachable
6. `notificationStream.subscribeToRedis()` — a no-op when Redis is disabled
7. `emailRetryWorker.start()`
8. `app.listen(PORT)`

A failure in steps 4–8 logs at `fatal` and exits with code 1.

## Shutdown

`SIGINT` and `SIGTERM` both trigger the same sequence:

1. Stop the email retry worker and await any sweep in flight, so a send in
   progress is recorded rather than abandoned
2. Release every open SSE connection — `server.close()` waits for connections to
   end, and streams are long-lived by design, so shutdown would otherwise never
   complete
3. Close the HTTP server
4. Disconnect Redis and MongoDB
5. Exit with code 0

## Running

### Backend

```
cd backend
npm ci
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
npm start                 # production
npm run dev               # nodemon
```

`npm run seed` loads development fixtures. It **deletes every user and complaint**
in the database named by `MONGODB_URI` before inserting. Never run it against a
production database.

### Frontend

```
cd frontend
npm ci
cp .env.example .env      # VITE_API_URL must point at the backend
npm run build             # output in dist/
npm run preview           # serve the build locally
```

`dist/` is static and can be served by any web server or CDN. The application
uses client-side routing, so the server must fall back to `index.html` for
unmatched paths.

## Reverse proxy

The notification stream requires two proxy behaviours:

- **No response buffering.** The application sets `X-Accel-Buffering: no` and
  `Cache-Control: no-cache, no-transform`, which nginx honours. A proxy that
  buffers regardless will hold events until the connection closes.
- **No read timeout below the heartbeat.** A comment frame is sent every 25
  seconds; a proxy read timeout shorter than that will drop idle connections.

Set `TRUST_PROXY` to the number of proxy hops in front of the application
(`1` for a single nginx, `2` behind a CDN as well). Without it Express resolves
`req.ip` from the socket, which is the proxy's address — so both rate limiters
collapse into a single shared bucket and the audit trail records the proxy
rather than the caller.

`auditService.getClientIp` reads `req.ip`, so the recorded address is only ever
as trusted as `TRUST_PROXY` says it is. The proxy should still overwrite
`X-Forwarded-For` rather than append. `TRUST_PROXY=true` trusts every hop and
makes express-rate-limit emit a permissive-trust-proxy warning; prefer a count.

An inbound `X-Request-Id` is reused when it matches `^[A-Za-z0-9._-]{8,64}$`,
allowing correlation to span the proxy.

## Scaling

The application is stateless apart from two in-memory structures, both of which
are per-instance by design:

| Structure | Module | Multi-instance behaviour |
|---|---|---|
| SSE connection registry | `notificationStream.js` | Per instance; Redis mirrors events between them |
| Consumed stream tickets | `streamTicket.js` | Per instance; see below |

A stream ticket is a self-contained JWT signed with the shared `JWT_SECRET`, so
any instance can verify one issued by another. The ticket exchange and the
subsequent stream connection do not need to reach the same instance, and no
session affinity is required.

The replay ledger, however, is held in process memory. Replay protection is
therefore per-instance: within the 30-second ticket lifetime, a ticket already
spent on one instance would still be accepted once by each other instance.

Email delivery is safe across instances without further configuration:
`claimForSend` performs an atomic status-guarded claim, so only one instance can
send a given notification.

## Health checks

`GET /api/health` is unauthenticated and returns 200 with:

```json
{
  "status": "ok",
  "uptime": 1234.5,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "environment": "production",
  "database": "connected",
  "subsystems": {
    "mongodb": "connected",
    "redis": "disabled",
    "email": "configured",
    "notificationStream": { "status": "ready", "recipients": 0, "connections": 0 }
  }
}
```

`database` reflects the Mongoose connection state: `connected`, `connecting`,
`disconnecting`, `disconnected` or `unknown`.

Optional subsystems report `disabled`, never `down`, so a probe must not treat
an unconfigured Redis or Brevo as a fault. No host, URI or credential is
exposed.

The endpoint returns 200 whenever the process is serving, including while
MongoDB is disconnected — a probe requiring database availability must inspect
the `database` field rather than the status code alone.

## Rate limits

| Scope | Limit |
|---|---|
| `/api` | 300 requests / 15 minutes |
| `/api/auth/login`, `/api/auth/register` | 20 **failed** attempts / 15 minutes |
| `/api/notifications/stream` | 30 requests / minute |

The credential endpoints skip successful requests, so an ordinary sign-in never
consumes an attempt and only guessing counts against the budget. `/api/auth/me`
is deliberately outside that limiter — it runs on every page load.

The stream route is excluded from the general limiter, because one SSE
connection is a single long-lived request while a flapping network reconnects
repeatedly, which would otherwise drain a user's ordinary allowance.

Both emit standard `RateLimit-*` headers and return 429 with the shared error
envelope and code `RATE_LIMITED`.

Limits are counted in memory per instance, so the effective limit across N
instances is N times the configured value.

## Security headers

`helmet()` with defaults, and CORS restricted to `CLIENT_URL`. `compression()`
is applied to all responses except where `no-transform` prevents it.

## Logging

Production emits one JSON object per line to stdout, with `fatal` and `error` to
stderr so a supervisor can separate them. Development emits readable single-line
output.

Every line carries `level`, `time` and `message`, plus `requestId`, `userId` and
`role` when a request context is active.

Secrets are redacted from every line, both by key pattern and by value pattern —
MongoDB and Redis URIs carrying credentials, `Bearer` tokens, and `token=` /
`ticket=` query parameters.

Requests taking 1000 ms or longer are logged as `Slow request` at `warn`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, as two
independent jobs.

| Job | Steps |
|---|---|
| Backend | `npm ci`, `npm run lint`, `npm run build`, `npm test`, `npm run test:coverage` |
| Frontend | `npm ci`, `npm run lint`, `npm run build`, `npm test` |

The backend job runs a MongoDB 7 service container with a health check and sets
`TEST_MONGODB_URI`. This matters because integration tests skip when no database
is reachable; without the service they would pass without executing.

Both jobs use Node 24 with npm caching keyed on the respective lockfile.

Coverage is reported but not enforced — no threshold is configured.

CI runs the same npm scripts a developer runs locally, so there is no CI-only
build path that can drift.

## Verification before release

```
cd backend  && npm run check    # lint + build + test
cd frontend && npm run check    # lint + build + test
```

`npm run check` is what CI enforces in both halves.
