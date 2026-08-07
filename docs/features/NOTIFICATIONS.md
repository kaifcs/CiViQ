# Notifications

Two delivery channels — in-app real time and email — driven from one persisted
record.

| Concern | Module |
|---|---|
| Orchestration, persistence, reads | `services/notificationService.js` |
| Delivery preferences | `services/notificationPreferences.js` |
| Real-time transport | `services/notificationStream.js` |
| Email transport | `services/emailService.js` |
| Email rendering | `services/emailTemplates.js` |
| Retry sweep | `services/emailRetryWorker.js` |
| Vocabulary | `config/notificationTypes.js` |
| Link routing | `config/notificationLinks.js` |
| Stream credentials | `utils/streamTicket.js` |

`notificationService` is the only module that writes or reads notifications.
Controllers hold no notification queries, which is what keeps the feed, the
unread count and the live stream from drifting apart.

## Types

Nine types, each mapping to exactly one category and priority. Category and
priority are derived from the type at creation rather than supplied by callers.

| Type | Category | Priority | Raised when |
|---|---|---|---|
| `clash_detected` | conflict | high | A new project collides with an existing one |
| `project_approved` | project | normal | An admin approves a project, or resolves a conflict with `approve_both` |
| `project_rejected` | project | high | An admin rejects a project, or reschedules one via `reject_lower` |
| `project_assigned` | project | normal | A supervisor is assigned to a project |
| `project_completed` | project | normal | Progress reaches 100 |
| `early_completion` | project | low | Defined; no caller |
| `complaint_assigned` | complaint | normal | A complaint is assigned to an officer |
| `complaint_status_changed` | complaint | low | A complaint's status changes |
| `role_changed` | system | high | An admin changes a user's role |

An unrecognised type falls back to `system` / `normal`, so a notification is
never lost to a metadata lookup; the model's enum is what rejects genuinely bad
input.

`system` is a mandatory category and cannot be muted — a user who no longer has
the role they think they have must be told regardless of preferences.

## Business events

| Event | Source | Recipient |
|---|---|---|
| Clash detected | `projectsController.createProject`, `projectsController.updateProject` | The submitting officer, and the officer owning the clashing project when different |
| Project approved | `projectsController.approveProject`, `conflictsController.resolveConflict` | Owning officer |
| Project rejected | `projectsController.rejectProject`, `conflictsController.resolveConflict` | Owning officer |
| Project assigned | `projectsController.updateProject` | Newly assigned supervisor |
| Project completed | `projectsController.updateProgress` | Owning officer |
| Complaint assigned | `complaintsController.assignComplaint` | Newly assigned officer |
| Complaint status changed | `complaintsController.updateStatus` | Assigned officer |
| Role changed | `usersController.updateUser` | The affected user |

Each fires only on an actual transition. Re-saving the same supervisor, the same
role or a project already at 100% progress produces nothing.

## Links

Client routes are namespaced by role, so the path a notification points at
depends on who receives it: the same project is `/admin/projects/:id` to an
administrator, `/officer/projects/:id` to its officer and `/supervisor/tasks/:id`
to its supervisor. A path built for the wrong role is refused by `RoleRoute`,
which redirects to that role's own dashboard instead of the record.

Producers therefore name a destination — `linkTo: { kind, id }`, where `kind` is
`project`, `complaint`, `conflict` or `conflicts` — and `notificationService`
resolves it to a path once it knows the recipient's role, reading those roles in
one query per batch. Only `link` is stored; `linkTo` never reaches the document.

`config/notificationLinks.js` holds the mapping and mirrors
`frontend/src/router/AppRouter.jsx`. A role with no screen for a kind resolves to
**no link at all** rather than one that would bounce — the supervisor shell has
no conflicts or complaints screen, and citizens have neither. An absent link is
already a supported state: `role_changed` has never carried one.

An explicit `link` passed by a caller is honoured as given.

## Delivery pipeline

```
createNotification / createNotifications
        │
        ├─ persist (always — history is never gated on preferences)
        │
        └─ queueDelivery  (fire-and-forget)
                 │
                 └─ deliver
                      ├─ resolve recipient once
                      ├─ shouldSendRealtime → publish to the SSE hub
                      └─ deliverEmail
                           ├─ email not configured → status "skipped"
                           ├─ suppressed by preferences → status "skipped"
                           └─ claim → send → delivered | pending (retry) | failed
```

Persistence always happens and is never gated on preferences, so history stays
complete regardless of what a user has muted. Preferences govern delivery and
default feed visibility only.

`deliver` resolves the recipient a single time and drives both channels from
that one lookup, so preference evaluation costs no extra query.

`queueDelivery` is fire-and-forget: a business operation must not wait on
delivery, and a delivery failure must never surface as a failed request.

## Failure isolation

`notificationService` wraps the dispatchers a controller awaits in a `dispatcher`
helper that logs and swallows failures. A notification write must never fail the
business operation that triggered it — the same contract `recordAudit` follows.

Wrapped: `createNotifications`, `notifyProjectApproved`, `notifyProjectRejected`,
`notifyProjectAssigned`, `notifyProjectCompleted`, `notifyComplaintAssigned`,
`notifyComplaintStatusChanged`, `notifyRoleChanged`.

Unwrapped: `createNotification`, `buildClashDetectedPayload`,
`notifyClashDetected`, `notifyEarlyCompletion`. These have no controller caller
on a completed-write path, so swallowing errors would hide failures from whoever
wires them up rather than protect an operation that already succeeded.

## Preferences

Per channel (`email`, `inApp`) and per category (`project`, `complaint`,
`conflict`, `system`). Stored on `User.notificationPreferences`, embedded so
`protect` already has them in memory on every authenticated request.

Absent or partial values read as opted in, so an account that has never visited
the settings screen receives everything.

`sanitisePreferences(patch, current)` drops unknown channels and categories,
coerces values to booleans, forces mandatory categories on, and does not mutate
the current object.

The two channels are independent: muting email does not mute the stream.

`visibleCategories(preferences)` returns the categories the user still wants in
the feed, and is what the read side applies.

## Real-time delivery

Server-Sent Events, chosen because delivery is one-directional. There is no
WebSocket transport and no polling.

### Authentication

`EventSource` cannot set an `Authorization` header. Rather than accepting a
session JWT in a URL, the client calls `POST /api/notifications/stream-ticket`
for a single-use ticket valid 30 seconds, signed with the same `JWT_SECRET`
through the same token helpers — there is no parallel signing key.

`streamAuth` consumes the ticket, exchanges it for a Bearer header, and
delegates to the unmodified `protect`, so account state is still enforced by the
one authentication pipeline. A session JWT is rejected because it carries no
`typ: "sse"` claim.

Consumed ticket ids are retained only until they would have expired anyway, so
the replay ledger is bounded by ticket lifetime rather than by traffic.

### Connection handling

| Behaviour | Value |
|---|---|
| Heartbeat | Comment frame every 25 s |
| Reconnect hint | `retry: 5000` sent on open |
| Connections per user | 8, oldest evicted first |
| Rate limit | 30 requests per minute on the stream route |

Response headers include `Cache-Control: no-cache, no-transform` — without
`no-transform` the compression middleware buffers the stream and nothing reaches
the client — and `X-Accel-Buffering: no` to defeat proxy-level buffering.

Heartbeat timers are `unref`'d, and shutdown releases every connection through
the same teardown a client disconnect uses, so no timer can keep the event loop
alive.

### Events

| Event | Payload |
|---|---|
| `notification.created` | The stored document |
| `notification.read` | The updated document |
| `notification.read_all` | `{ updated }` |
| `notification.archived` | `{ ids }` |
| `notification.unarchived` | `{ ids }` |
| `notification.deleted` | `{ ids }` |
| `notification.preferences_updated` | `{ preferences }` |

Lifecycle events carry only the ids they touched, so a single and a bulk action
share one payload shape.

### Cross-instance fan-out

Delivery is two-tier. Connections held by the current process are written
directly, and when Redis is configured the same event is mirrored to other
instances over the `civiq:notifications` channel.

Every broadcast carries the originating process id, so an instance ignores its
own event coming back rather than delivering it twice. Without Redis the hub is
process-local and behaves exactly as it does on a single instance.

A Redis publish failure is logged and does not affect the local delivery that
already succeeded.

## Email delivery

Sent through the Brevo REST API using the global `fetch`; no provider SDK, HTTP
client or SMTP configuration is involved. Requests carry a 10-second timeout,
because Node's `fetch` has none by default.

Email is optional: without `BREVO_API_KEY` and `MAIL_FROM_EMAIL` the application
runs normally, notifications persist and stream, and delivery is recorded as
`skipped`.

### State machine

The notification row is the queue. No broker or second collection exists.

| `deliveryStatus` | Meaning |
|---|---|
| `pending` | Not yet attempted, or awaiting retry |
| `sending` | Claimed by a worker |
| `delivered` | Accepted by the provider |
| `failed` | Permanently rejected, or out of attempts |
| `skipped` | Email disabled, or suppressed by preferences |

`claimForSend` performs `findOneAndUpdate` guarded on `deliveryStatus: "pending"`.
Exactly one caller can move a row out of `pending`, so repeated sweeps and
concurrent instances cannot produce a duplicate send.

### Retries

Maximum 4 attempts, with delays of 60 s, 300 s and 900 s. A failure that can be
retried returns the row to `pending` with `nextAttemptAt` set; `failed` is
terminal.

429 and 5xx responses are treated as transient. Other 4xx responses are
permanent, because retrying would resend the same rejected payload. A request
that never reached the provider — aborted or refused — is treated as retryable.

`emailRetryWorker` sweeps every 60 s in batches of 25, guarded against
overlapping passes and inert when email is not configured. `retryEmail` re-reads
the recipient, so a retry honours an opt-out made after the notification was
created.

Shutdown awaits any sweep already running, so a send in progress is recorded
rather than abandoned.

### Rendering

`emailTemplates.renderNotificationEmail` produces subject, HTML and plain text
through one shared layout. Only the accent colour and label differ per category,
so branding cannot drift. Every interpolated value passes through
`escapeHtml`, and `absoluteLink` converts a stored relative link into an
absolute URL using `CLIENT_URL`.

## Read side

Every query is scoped to the recipient in the filter itself, so ownership is
enforced by construction.

Two exclusions apply to the default feed:

- **Archived records.** Archive is the soft delete for notifications: the record
  leaves the feed but stays retrievable via `?archived=true` or `?archived=all`.
- **Muted categories.** Categories the user has muted for the in-app channel are
  hidden but never deleted; `?includeMuted=true` or an explicit `?category`
  returns them.

Without explicit pagination the feed is capped at 50 records. The unread count
is queried separately so the badge is exact rather than a count of whatever the
capped list returned.

Sorting is whitelisted to `createdAt`, `priority` and `read`, defaulting to
newest first. Search input is escaped before being used as a regular expression.

The archived filter is expressed as `archived: false` rather than
`{ $ne: true }`. `$ne` compiles to two open-ended index ranges, which breaks the
sorted prefix of `{ recipient, archived, createdAt }` and forces an in-memory
sort of the recipient's entire history to return one page; a point equality
keeps the scan sorted.

Being an equality, it does not match a document with no `archived` field. The
schema defaults it to `false`, so nothing written through the model looks like
that — only data migrated from before the field existed, which would be missing
from the feed and the badge alike until backfilled.

## Frontend integration

`NotificationContext` is the single source of notification state. The navbar
badge, the dropdown and the Notification Center all read from it, so one fetch
serves every consumer and the counts cannot disagree.

The initial load fetches the list, the exact unread count and preferences in one
`Promise.all`. Stream events merge into that same state rather than a second
copy. An unarchive triggers a REST reload, because it returns a row to the feed
and the event carries only ids.

Lifecycle actions are optimistic and revert on failure. The server also
broadcasts each change; the originating tab has already converged, so those
arrive as no-ops.

`services/notificationStream.js` handles reconnection itself rather than relying
on `EventSource`'s built-in retry, because that would replay the identical
spent-ticket URL. Each attempt fetches a fresh ticket, with exponential backoff
from 2 s to a 30 s ceiling. A reconnect triggers a REST resynchronisation, since
events may have been missed while disconnected.

## Test coverage

| Suite | Covers |
|---|---|
| `test/unit/notificationPreferences.test.js` | Defaults, opt-in semantics, mandatory categories, sanitisation, channel independence |
| `test/unit/notificationStream.test.js` | SSE headers, once-per-tab delivery, cross-recipient isolation, connection cap and eviction, idempotent teardown, timer release on shutdown |
| `test/unit/streamTicket.test.js` | Single use, expiry, wrong secret, session-JWT rejection, ledger bounding |
| `test/integration/notificationFilter.test.js` | Feed exclusions, archived variants, muted categories, badge/list agreement, pagination, search escaping, recipient scoping, index-served query plan |
