# API Reference

Base path: `/api`. Machine-readable specification: OpenAPI 3.0.3 at
`GET /api/docs.json`, with Swagger UI at `GET /api/docs`. Both are
unauthenticated.

The specification declares 46 paths and 56 operations.

## Authentication

Bearer JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtained from `POST /api/auth/login`. The token payload carries only the user
id; the role is re-read from the database on every request, so a role change or
deactivation takes effect immediately.

The notification stream is the one exception — see
[GET /api/notifications/stream](#get-apinotificationsstream).

## Access notation

| Notation | Meaning |
|---|---|
| public | No authentication |
| auth | Any authenticated role |
| *role* | `protect` plus `authorize(<roles>)` |
| owner | Additionally restricted to records the caller owns |

## Response envelopes

Errors are uniform:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] },
  "message": "..."
}
```

`message` is duplicated at the top level. `details` is omitted when
`NODE_ENV=production`.

Success payloads are not uniform. Auth, departments, users and dashboard wrap in
`{ success, ... }`; projects, conflicts, complaints, audit and notifications
return the document or a bare array.

### Error codes

| Code | Typical status |
|---|---|
| `AUTH_UNAUTHORIZED` | 401 |
| `AUTH_FORBIDDEN` | 403 |
| `AUTH_TOKEN_EXPIRED` | 401 |
| `AUTH_INVALID_CREDENTIALS` | 401 |
| `AUTH_ACCOUNT_DEACTIVATED` | 403 |
| `VALIDATION_ERROR` | 400 |
| `INVALID_ID` | 400 |
| `CONFLICT` | 409 |
| `DUPLICATE_RESOURCE` | 409 |
| `NOT_FOUND` | 404 |
| `PROJECT_NOT_FOUND` | 404 |
| `COMPLAINT_NOT_FOUND` | 404 |
| `CONFLICT_NOT_FOUND` | 404 |
| `DEPARTMENT_NOT_FOUND` | 404 |
| `USER_NOT_FOUND` | 404 |
| `NOTIFICATION_NOT_FOUND` | 404 |
| `AUDIT_LOG_NOT_FOUND` | 404 |
| `ROUTE_NOT_FOUND` | 404 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

## Common conventions

**Pagination** is opt-in on list endpoints via `?page` and `?limit`. Default
limit 25, maximum 200. Without either parameter the full list is returned.
Metadata travels in headers:

| Header | Meaning |
|---|---|
| `X-Total-Count` | Total matching records |
| `X-Page` | Current page |
| `X-Limit` | Page size |
| `X-Total-Pages` | Total pages (minimum 1) |
| `X-Has-Next` | `true` / `false` |
| `X-Has-Previous` | `true` / `false` |

**Correlation.** Every response carries `X-Request-Id`. An inbound
`X-Request-Id` matching `^[A-Za-z0-9._-]{8,64}$` is reused; otherwise one is
generated.

**Rate limiting.** 300 requests per 15 minutes across `/api`, 20 **failed**
attempts per 15 minutes on `/api/auth/login` and `/api/auth/register`, and 30
per minute on `/api/notifications/stream`. Exceeding any of them returns 429
`RATE_LIMITED`. Successful sign-ins do not consume the credential budget, and
`/api/auth/me` is outside it.

---

## Health

### GET /api/health
**public**

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

Optional subsystems report `disabled`, never `down`; running without Redis or
Brevo is a supported configuration. No host, URI or credential is exposed.

---

## Auth — `/api/auth`

### POST /api/auth/register
**admin**

Account creation is an administrative act, not self-service.

| Field | Required | Rule |
|---|---|---|
| `fullName` | yes | Non-empty |
| `email` | yes | Must match the email pattern |
| `password` | yes | Minimum 8 characters |
| `role` | yes | `officer` or `supervisor` only |
| `phone` | no | |

`admin` and `citizen` cannot be created here, so no single request both creates
a principal and grants it unrestricted access; promote an account with
`PUT /api/users/:id` afterwards. Returns `201` with `{ success, message, user }`.
A duplicate email returns 409 `DUPLICATE_RESOURCE`.

Because every account-creating path requires an existing administrator, the
first administrator is provisioned outside the API — `npm run seed` in
development, or a direct database insert in production.

### POST /api/auth/login
**public**

Body `{ email, password }`. Returns `{ success, message, token, user }`.

An unknown email, a wrong password and an inactive account all return the same
401 with the message `Invalid email or password`, so the endpoint cannot be used
to enumerate accounts. `lastLogin` is updated on success.

### POST /api/auth/logout
**auth**

Returns `{ success, message }`. Sessions are stateless JWTs, so this records the
event; the client discards the token. Nothing is invalidated server-side.

### GET /api/auth/me
**auth**

Returns `{ success, user }` for the authenticated caller.

---

## Projects — `/api/projects`

All routes require authentication.

### GET /api/projects
**auth**, scoped

Returns a bare array. Scope is applied by role: an officer sees projects where
they are `officer`, a supervisor sees projects where they are `supervisor`, an
admin sees all.

Populates `officer` and `supervisor` (`fullName`, `email`, `department`),
`department` (`name`, `code`) and `projectManager` (`fullName`, `email`).

Soft-deleted projects (`isActive: false`) are excluded.

Supports `?page` and `?limit`; the reported total respects the caller's scope
and the same exclusion.

### GET /api/projects/:id
**auth**, owner

Guarded by `requireProjectAccess`. A project outside the caller's scope returns
404 `PROJECT_NOT_FOUND`, identical to a project that does not exist, so ids
cannot be probed. A soft-deleted project returns the same 404; only
`PATCH /api/projects/:id/status` can restore it. An invalid id returns 400
`INVALID_ID`.

### POST /api/projects
**officer, admin**

Required: `title`, `projectType`, `description`, `startDate`, `endDate`,
`location.centerCoords.lat`, `location.centerCoords.lng`. `department` falls
back to the caller's department when omitted.

Validation: the department must exist and be active; a supplied
`projectManager` must exist, be active and hold a staff role (admin, officer or
supervisor); a supplied `supervisor` must exist, be active and hold the
`supervisor` role, because `PUT /:id/progress` is gated on that role and any
other assignee would leave the project impossible to complete; `endDate` cannot
precede `startDate`. The same rules apply to `PUT /api/projects/:id`.

The request runs MCDM scoring and clash detection. Returns `201`:

```json
{ "project": { }, "mcdm": { "score": 7.4, "breakdown": { }, "outOf100": 74 }, "clashesDetected": 2 }
```

`officer` and `createdBy` are set to the caller.

### PUT /api/projects/:id
**admin, officer, supervisor**, owner

Writable fields are whitelisted: the fields listed for `POST`, plus
`supervisor`. Everything else is server-owned and ignored if supplied —
`officer`, `createdBy`, `projectId`, `status`, `isActive`, `progress`,
`actualEndDate`, `mcdmScore`, `mcdmBreakdown`, `hasClash`, `clashes`,
`adminNote`, `rejectionReason` and `suggestedDate` each have their own endpoint
or are written by the engines.

Assigning a new `supervisor` sends a `project_assigned` notification; re-saving
the same supervisor is silent.

A `completed` or `rejected` project returns 409 and nothing is written, not even
the MCDM and clash recomputation an edit normally triggers. Finished work is a
historical record: moving `startDate` after completion would leave
`actualEndDate` before it, which `GET /api/dashboard/projects` reports as a
negative `averages.completionDays`.

### PUT /api/projects/:id/approve
**admin**

Body `{ note }`. Sets `status` to `approved`, stores `adminNote`, notifies the
owning officer and records `project_approved`.

### PUT /api/projects/:id/reject
**admin**

Body `{ reason, suggestedDate }`. Sets `status` to `rejected`, stores
`rejectionReason` and `suggestedDate`, notifies the owning officer and records
`project_rejected`.

### PUT /api/projects/:id/progress
**supervisor**, owner

Body `{ progress }` — a number from 0 to 100; anything else returns 400 and
nothing is written. A numeric string is accepted and coerced. At `100` the
status becomes `completed` and `actualEndDate` is stamped. The owning officer is
notified only on the transition, not on repeated saves at 100.

`status` must be `approved` or `active`; anything else returns 409. In
particular a `pending` project is refused — progress before approval would set
the project to `completed`, and both `approve` and `reject` require `pending`,
so the administrator's decision would be locked out permanently.

### PATCH /api/projects/:id/status
**admin**

Body `{ isActive }` — boolean, required. Soft delete; a non-boolean returns 400.

---

## Conflicts — `/api/conflicts`

All routes require authentication.

### GET /api/conflicts
**auth**

Returns a bare array. `project1` and `project2` are populated with `title`,
`department`, `projectType`, `status`, `mcdmScore`, `officer`, `supervisor`,
`startDate`, `endDate`, `location.centerCoords` and `location.ward`.

Each populated project the caller may not access is collapsed to a bare id, so
the conflict remains coherent while its details stay hidden. Supports `?page`
and `?limit`.

### GET /api/conflicts/:id
**auth**

Same redaction as the list.

### PUT /api/conflicts/:id/resolve
**admin**

| Field | Notes |
|---|---|
| `action` | `approve_both` or `reject_lower`, required |
| `coordinationNote` | Optional |
| `overrideCategory`, `overrideReason`, `overrideRef` | Optional; supplying `overrideCategory` marks the audit entry as an override |

Only a `pending` conflict can be resolved; otherwise 409 `CONFLICT`.

Resolution rewrites project status, so it is refused with 409 when that would
overwrite finished work: `approve_both` when either project is already
`completed` or `rejected`, and `reject_lower` when the deferred (lower-scoring)
one is. A finished winner does not block `reject_lower` — it is never rewritten,
only its `endDate` is read for the suggested date.

`approve_both` sets both projects to `approved` and notifies both officers.
`reject_lower` sets the lower-`mcdmScore` project to `rescheduled` with a
`suggestedDate` derived from the winning project's end date plus its configured
buffer, moves the conflict to `awaiting_officer`, records `rescheduledProject`
and notifies only the affected officer.

### PUT /api/conflicts/:id/respond
**officer**, owner

| Field | Notes |
|---|---|
| `action` | `accept` or `custom`, required |
| `customDate` | Required when `action` is `custom`; must be on or after `suggestedDate` |

Only the officer who owns the rescheduled project may respond; otherwise 403.
The conflict must be `awaiting_officer` and have a `suggestedDate`.

The project's `startDate` is set to the new date and its status returns to
`pending`. Clash detection re-runs before the save. Returns:

```json
{ "conflict": { }, "recheckPassed": true, "newClashes": [] }
```

---

## Complaints — `/api/complaints`

### GET /api/complaints
**public**

Returns a bare array, newest first. No ownership filter is applied.

**Redacted for an unauthenticated caller.** Every complaint is returned either
way, but `serialiseComplaint` removes `assignedOfficer`, `assignedDepartment`,
`photoUrl`, `resolutionNote`, `location.coords` and `location.address` when
there is no session. `location.ward` is kept, so the public aggregate views
still work. An authenticated caller of any role receives the full document.

| Query | Effect |
|---|---|
| `status` | Exact match; a value outside the enum returns 400 |
| `department` | Matches `assignedDepartment` |
| `issueType` | Exact match; a value outside the enum returns 400 |
| `assignedOfficer` | ObjectId; invalid values return 400 |
| `from`, `to` | `createdAt` range |
| `search` | Case-insensitive across `cnrId`, `description`, `location.address`, `location.ward`; input is escaped before use as a regular expression |
| `page`, `limit` | Pagination |

### GET /api/complaints/:id
**public**

Accepts either a Mongo `_id` or a `cnrId`, which is what lets a citizen track a
report by its public reference. Redacted for an unauthenticated caller exactly
as the list is, so tracking reveals status and ward but never the reporter's
address, coordinates, photo or the internal assignment.

### POST /api/complaints
**public**

Writable fields: `issueType`, `description`, `location`, `photoUrl`. Any other
field is ignored — in particular `status`, `assignedDepartment` and
`assignedOfficer` are server-owned. A complaint always begins `submitted` and
unassigned, and only the role-gated `PATCH /:id/status` and `PATCH /:id/assign`
move it from there. Values supplied for them are dropped, not rejected.

`issueType`, `description` and `location.coords` are required by the schema.
`cnrId` is generated. Returns `201` with the created document and records
`complaint_created`.

### PUT /api/complaints/:id
**admin, officer, supervisor**

Writable fields: everything a reporter may supply, plus the workflow state —
`status`, `resolutionNote`, `assignedDepartment` and `assignedOfficer`. This
route is role-gated, which is why it may write what the public POST may not. A
`note` field is accepted as an alias for `resolutionNote`. `status` and
`issueType` are validated against their enums, and `assignedOfficer` must be an
active staff account. Records `complaint_updated`.

### PATCH /api/complaints/:id/status
**admin, officer, supervisor**

Body `{ status }`, with optional `note` or `resolutionNote`. Records
`complaint_status_updated` and notifies the assigned officer when one is set.

### PATCH /api/complaints/:id/assign
**admin, officer**

Body `{ assignedDepartment, assignedOfficer }` — at least one required. Both
references are validated for existence and active state, and `assignedOfficer`
must additionally hold a staff role: admin, officer and supervisor can all move
a complaint's status, so any of them is a valid assignee, but a `citizen` is
rejected. Records `complaint_assigned` and notifies the new officer only when
the assignment actually changes.

---

## Departments — `/api/departments`

All routes require authentication.

### GET /api/departments
**auth**

Returns `{ success, count, departments }`. Reads are open to every
authenticated role because departments are referenced by id on complaints and
users, and other roles could not otherwise resolve those ids to display codes.

### GET /api/departments/:id
**auth**

Returns `{ success, department }`.

### POST /api/departments
**admin**

Body `{ name, code, description, color }`. `name` and `code` are unique; `code`
is uppercased. Returns `201`.

### PUT /api/departments/:id
**admin**

### PATCH /api/departments/:id/status
**admin**

Body `{ isActive }`. Deactivation preserves references from existing projects
and complaints.

---

## Users — `/api/users`

All routes are administrator-only. There is no create endpoint — accounts arrive
through registration — and no delete endpoint.

### GET /api/users
**admin**

Returns `{ success, count, users }`, newest first, with the password hash
excluded. Supports `?page` and `?limit`.

### GET /api/users/:id
**admin**

Returns `{ success, user }`.

### PUT /api/users/:id
**admin**

Updatable: `fullName`, `phone`, `avatar`, `role`, `department`. `role` is
validated against the schema enum. An actual role change sends a `role_changed`
notification; re-saving the same role is silent.

### PATCH /api/users/:id/status
**admin**

Body `{ isActive }`. A deactivated account is refused at login and loses access
on its next request, because `protect` re-reads the user each time.

---

## Notifications — `/api/notifications`

Every route is scoped to the authenticated recipient. Ownership is enforced by
the query filter itself, so another user's notification is reported as missing.

### GET /api/notifications
**auth**

Returns a bare array. Without pagination the feed is capped at 50 records.

| Query | Effect |
|---|---|
| `read` | `true` / `false` |
| `type` | Exact match |
| `category` | Exact match; overrides preference filtering |
| `priority` | Exact match |
| `archived` | `true` for archived only, `all` for both; omitted excludes archived |
| `includeMuted` | `true` disables category preference filtering |
| `search` | Case-insensitive across `title` and `message`; input is escaped |
| `sortBy` | `createdAt` (default), `priority` or `read` |
| `order` | `asc` or `desc` (default) |
| `page`, `limit` | Pagination |

Two exclusions apply by default: archived records, and categories the recipient
has muted for the in-app channel. `?archived=all` and `?includeMuted=true`
override them.

### GET /api/notifications/unread-count
**auth**

Returns `{ count }` — unread, not archived, and only from categories the
recipient still wants. This is the badge count and matches what the list would
show.

### GET /api/notifications/:id
**auth**

A notification owned by someone else returns 404, not 403.

### PATCH /api/notifications/:id/read
**auth**

Returns the updated document and publishes `notification.read` so the
recipient's other tabs converge.

### PATCH /api/notifications/read-all
**auth**

Also accepted as `PUT` for existing clients. Only unread rows are touched, so
`readAt` records the first read. The set cleared is exactly the set the unread
count reports — archived notifications and muted categories are left untouched,
so restoring one later still shows it as unread. Returns `{ message, updated }`,
where `updated` is the number of rows actually changed.

### PATCH /api/notifications/:id/archive
### PATCH /api/notifications/:id/unarchive
**auth**

Archive is reversible and keeps history. Returns `{ ids, updated }`; a
no-op returns 404.

### DELETE /api/notifications/:id
**auth**

Permanent. Returns `{ ids, deleted }`.

### PATCH /api/notifications/bulk-archive
### PATCH /api/notifications/bulk-unarchive
### DELETE /api/notifications/bulk-delete
**auth**

Body `{ ids: [...] }` — non-empty, maximum 200 entries; exceeding it returns
400. Ids belonging to another recipient are silently excluded rather than
failing the request. `bulk-delete` sends its ids in the request body.

### GET /api/notifications/preferences
### PATCH /api/notifications/preferences
**auth**

Preferences are per channel (`email`, `inApp`) and per category (`project`,
`complaint`, `conflict`, `system`). Unknown channels and categories are dropped
and values coerced to booleans. Mandatory categories cannot be switched off.

`PATCH` accepts `{ preferences: { ... } }` or the bare object. Returns
`{ preferences }` and publishes `notification.preferences_updated`.

### POST /api/notifications/stream-ticket
**auth**

Returns `{ ticket, expiresIn }`. The ticket is single-use and expires in 30
seconds.

### GET /api/notifications/stream
**ticket**

Server-Sent Events. `EventSource` cannot set an `Authorization` header, so this
route takes `?ticket=<ticket>` instead. The ticket is exchanged for a Bearer
header and validated by the same `protect` middleware, so account state is still
enforced. A session JWT is rejected: it carries no ticket type.

A missing, invalid, expired or spent ticket returns 401 `AUTH_UNAUTHORIZED` in
the standard error envelope, the same shape as every other rejection.

Events: `notification.created`, `notification.read`, `notification.read_all`,
`notification.archived`, `notification.unarchived`, `notification.deleted`,
`notification.preferences_updated`. A comment heartbeat is sent every 25 seconds.
Each connection is capped at 8 per user, oldest evicted first.

---

## Audit — `/api/audit`

Administrator-only and read-only.

### GET /api/audit
**admin**

Filters are applied by the server: `action`, `performedBy` (User ObjectId),
`targetType`, `isOverride` (`true`/`false`) and the `from`/`to` `createdAt`
range, alongside `page` and `limit`. A malformed `performedBy` or a
non-boolean `isOverride` returns 400. When paginated, the reported total counts
the filtered set.

Returns a bare array, newest first, with `performedBy` populated (`fullName`,
`role`, `department`). Without pagination the response is capped at 200 records.

### GET /api/audit/:id
**admin**

Returns the entry, or 404 `AUDIT_LOG_NOT_FOUND`.

---

## Dashboard — `/api/dashboard`

Administrator-only and read-only. Every endpoint reports across the whole
municipality. All return `{ success: true, data: { ... } }`.

Shared query parameters:

| Parameter | Applies to |
|---|---|
| `department` | ObjectId; invalid values return 400 |
| `from`, `to` | `createdAt` range; invalid dates return 400 |
| `status` | Applied per collection where the enum matches |
| `priority` | Projects |
| `ward` | Matched at each collection's own ward path |
| `complaintStatus` | Complaints; validated against the complaint enum |

### GET /api/dashboard/summary
Cross-domain totals for projects, conflicts, complaints, departments, users,
notifications and audit. Project `delayed` is derived — past `endDate` and not
in a terminal status — and is not a stored value. Notification `unread` is
derived at query time.

### GET /api/dashboard/projects
Totals and breakdowns by status, priority, type, ward, department and month,
plus average progress, average MCDM score and average completion days.

### GET /api/dashboard/conflicts
Totals, open and resolved counts, breakdowns by status, severity, ward and
month, and the `recheckPassed` count. Ward is taken from the first clashing
project, joined server-side.

### GET /api/dashboard/complaints
Totals, open and closed counts, unassigned count, breakdowns by status, issue
type, department, ward and month, and average resolution days.

### GET /api/dashboard/departments
Per-department project count, completed count, average progress and complaint
count, sorted by project count.

### GET /api/dashboard/activity
Audit totals, override count, breakdowns by action, target type and month, plus
the most recent entries. `?limit` caps the recent list at 100, default 20.

---

## Documentation

### GET /api/docs
**public** — Swagger UI.

### GET /api/docs.json
**public** — the raw OpenAPI 3.0.3 document.
