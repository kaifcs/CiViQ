# API Reference

Base path: `/api`. Machine-readable specification: OpenAPI 3.0.3 at
`GET /api/docs.json`, with Swagger UI at `GET /api/docs`. Both are
unauthenticated.

The specification declares 52 paths and 62 operations.

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
limit 25, maximum 200. Without either parameter the full list is returned,
except where an endpoint caps an unpaginated read:

| Endpoint | Cap without `?page`/`?limit` |
|---|---|
| `GET /api/complaints` | 200 — it is public, so it cannot be left unbounded |
| `GET /api/audit` | 200 — the trail grows without bound |
| `GET /api/notifications` | 50 — the default feed |

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

**Rate limiting.** Four limiters, all returning 429 `RATE_LIMITED`:

| Scope | Limit |
|---|---|
| `/api` | 1000 requests / 15 minutes; skips `/api/notifications/stream` |
| `/api/auth/login`, `/api/auth/register`, `/api/auth/password` | 20 **failed** attempts / 15 minutes |
| `/api/notifications/stream` | 30 requests / minute |
| `POST /api/complaints` | 10 requests / hour |

Successful sign-ins do not consume the credential budget, and `/api/auth/me` is
outside it. The complaint limiter applies only to public complaint *creation* —
it is matched on method and path, so reading or updating a complaint is
unaffected — because that is the one write any unauthenticated caller can make.

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
| `fullName` | yes | String, non-empty |
| `email` | yes | String matching the email pattern |
| `password` | yes | String, minimum 8 characters |
| `role` | yes | `officer` or `supervisor` only |
| `phone` | no | |

The string fields are checked by type, not by coercion, and a non-string returns
400. Coercion would be the hole: `["real@civiq.test"]` stringifies to a
valid-looking address and would otherwise pass the pattern.

`admin` cannot be created here, so no single request both creates
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

`email` and `password` must both be non-empty strings. A missing field and a
field of the wrong type both return 400 with the same message, `Email and
password are required`, so a wrong type is not distinguishable from a missing
one and the endpoint does not become a probe for how it parses input.

### POST /api/auth/logout
**auth**

Returns `{ success, message }`. Sessions are stateless JWTs, so this records the
event; the client discards the token. Nothing is invalidated server-side.

### GET /api/auth/me
**auth**

Returns `{ success, user }` for the authenticated caller.

### PUT /api/auth/profile
**auth**

Self-service profile update, always scoped to the caller — distinct from the
admin-only `PUT /api/users/:id`, which can edit any account. Writable:
`fullName`, `phone`, `avatar`. `role`, `department`, `isActive` and `email`
are not reachable through this endpoint at all, so there is no path from a
self-service update to a privilege change.

All three writable fields are schema strings, so a non-string returns 400
`<field> must be a string` and nothing is written. `fullName` must also be
non-blank after trimming.

Returns `{ success, user }` with the updated record. Records a
`profile_updated` audit entry.

### PUT /api/auth/password
**auth**

Body `{ currentPassword, newPassword, confirmPassword? }`. The current
password is verified before the change is applied; a wrong one returns
**400**, not 401 — this is a validation failure of an already-authenticated
request, and a 401 here would trip the frontend's global logout-on-401
handling for a simple typo. `newPassword` follows the same policy as
registration (minimum 8 characters); a supplied `confirmPassword` must match
it.

Returns `{ success, message }`. Records a `password_changed` audit entry.
Shares `/api/auth/login`'s rate-control budget, since it also verifies a
secret. The session token remains valid afterwards: it is a stateless JWT
carrying only the user id, not a password fingerprint, so there is no
server-side session to revoke — the same limitation that already applies to
`/api/auth/logout`.

---

## Config — `/api/config`

### GET /api/config/wards
**public**

The municipal ward register, served from `config/staticConfig.wards`. Read-only:
there is no ward collection and no route that modifies the register — it is
redrawn by municipal notification, not by an operator.

```json
{ "success": true, "count": 9, "wards": ["Ward 3", "Ward 5", "..."] }
```

**Unauthenticated**, deliberately. The public complaint form at
`POST /api/complaints` selects a ward from this register and needs no session,
so neither does the lookup. The response is a static list of ward names: it
carries no user, project or complaint data, and reveals only which wards the
municipality operates in.

Client selectors read this rather than carrying their own copy, so the values
offered are always the ones the backend reasons about. `Project.location.ward`
drives clash-detection candidate selection, the MCDM condition criterion and
every ward analytic, and `Complaint.location.ward` feeds the same condition
criterion — a value outside this register degrades all of them.

---

## Projects — `/api/projects`

Every route requires authentication except the two public ones below, which
back the citizen transparency portal.

### GET /api/projects/public
**public**

The citizen transparency portal's project list. Returns a bare array,
newest first, scoped to `status` in `approved`, `active`, `completed` or
`rescheduled` and `isActive: true` — a `pending` project is still under
internal review and a `rejected` one never happened, so neither is public.

The payload is whitelisted by `serialisePublicProject`, not redacted from the
full document: only `id`, `title`, `description`, `department` (`code`,
`name`), `projectType`, `status`, `progress`, `startDate`, `endDate`,
`actualEndDate` and `location` (`ward`, `zone`, `address`, `city`, `state`,
`centerCoords`) are present. Officer, supervisor, MCDM score, clash state and
every other internal field are absent from the shape entirely. Supports
`?page` and `?limit`.

Capped at 200 records without `?page`/`?limit`, the same ceiling the complaint
list and the audit trail apply. `X-Total-Count` is sent on every response,
paginated or not, so a truncated read can be told from a complete one.

### GET /api/projects/public/:id
**public**

Same scope and field whitelist as the list. A project outside the public
statuses returns 404 `PROJECT_NOT_FOUND`, identical to one that does not
exist. An invalid id returns 400 `INVALID_ID`.

### GET /api/projects
**auth**, scoped

Returns a bare array. Scope is applied by role: an officer sees projects where
they are `officer`, a supervisor sees projects where they are `supervisor`, an
admin sees all.

Populates `officer` and `supervisor` (`fullName`, `email`, `department`),
`department` (`name`, `code`) and `projectManager` (`fullName`, `email`).

Soft-deleted projects (`isActive: false`) are excluded, unless an
**administrator** sends `?includeDeleted=true`. That is the only way to find a
deleted project: every other read path hides one, so without it
`PATCH /api/projects/:id/status` could never be used to restore it. The role
scope still applies, and for a non-admin caller the parameter is ignored rather
than refused.

Supports `?page` and `?limit`; the reported total respects the caller's scope
and whichever exclusion is in force.

### GET /api/projects/:id
**auth**, owner

Guarded by `requireProjectAccess`. A project outside the caller's scope returns
404 `PROJECT_NOT_FOUND`, identical to a project that does not exist, so ids
cannot be probed. A soft-deleted project returns the same 404 — it is reachable only through
`GET /api/projects?includeDeleted=true`, and only
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
precede `startDate`; `location.centerCoords.lat` must be within `[-90, 90]` and
`location.centerCoords.lng` within `[-180, 180]`. The same rules apply to
`PUT /api/projects/:id`.

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

Applies only to a project still `pending`. One already approved, rejected,
completed or rescheduled returns 409 — the decision has already been made.

### PUT /api/projects/:id/reject
**admin**

Body `{ reason, suggestedDate }`. Sets `status` to `rejected`, stores
`rejectionReason` and `suggestedDate`, notifies the owning officer and records
`project_rejected`.

Applies only to a project still `pending`, exactly as `approve` does; anything
else returns 409.

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

Body `{ isActive }` — boolean, required. A non-boolean returns 400.

`false` is a **soft delete**: the document and its audit trail are kept and only
its visibility changes. `true` restores it. Both are recorded as
`project_status_updated`.

Because every read path hides a soft-deleted project — the list filter, and
`requireProjectAccess`, which answers 404 — an administrator needs
`GET /api/projects?includeDeleted=true` to find one before it can be restored.
There is no hard delete.

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

Resolution writes `Project.status` directly, so it does not pass through the
preconditions the project routes enforce. The equivalent ones are applied here,
and a refusal writes nothing at all — neither project, nor the conflict.

| Refused when | Why |
|---|---|
| Either project is `completed` or `rejected` | Finished work is a historical record |
| Either project is `rescheduled` | Another conflict has deferred it and is still awaiting that officer's answer. Rewriting it here would strand the earlier conflict — it would keep pointing at a deferral the project no longer carries while the project proceeded on the dates that caused it. Retry once the officer has responded. |

Each guard is scoped to the project the chosen action actually writes:
`approve_both` checks both sides, `reject_lower` only the deferred
(lower-scoring) one — so a finished winner does not block `reject_lower`, whose
`endDate` is merely read for the suggested date.

`approve_both` authorises both projects to proceed. A project still awaiting a
decision moves to `approved` and its officer is notified; one that is already
`approved` or `active` keeps the position it has reached. In-flight work is
therefore never rolled back — resetting an `active` project to `approved` would
leave `progress` intact on a record marked as not yet begun, and drop it out of
the `projects.active` figure `GET /api/dashboard/summary` reports.

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

The two filters that narrow by internal allocation are gated on the same rule:
without a session `department` and `assignedOfficer` are **ignored**, because
membership of a filtered result set would prove the assignment the redaction
just removed, and `X-Total-Count` would report an exact count of it. They are
dropped rather than rejected, as server-owned fields are on the write side, so
an ignored filter cannot be probed by watching for a validation error either.

| Query | Effect |
|---|---|
| `status` | Exact match; a value outside the enum returns 400 |
| `department` | **auth only** — matches `assignedDepartment`; ignored without a session |
| `issueType` | Exact match; a value outside the enum returns 400 |
| `assignedOfficer` | **auth only** — ObjectId, invalid values return 400; ignored without a session |
| `from`, `to` | `createdAt` range |
| `search` | Case-insensitive across `cnrId`, `description`, `location.address`, `location.ward`; input is escaped before use as a regular expression |
| `page`, `limit` | Pagination |

**Capped at 200 records without `?page`/`?limit`.** This is the one public list
in the API, so it cannot be left unbounded — an anonymous caller would otherwise
receive the whole collection in a single response, growing with it for ever.

`X-Total-Count` is sent on **every** response, paginated or not, so truncation is
never silent: compare it against the array length. Page through for more
records, or use [`GET /api/complaints/stats`](#get-apicomplaintsstats) for
city-wide figures, which counts in the database rather than shipping the rows.

### GET /api/complaints/stats
**public**

City-wide complaint figures for the public citizen dashboard, computed by
`analyticsService` — the same module `GET /api/dashboard/complaints` reads, so
the citizen and admin views cannot report different numbers for the same thing.

```json
{
  "total": 1200, "open": 900, "closed": 300,
  "byStatus": { "submitted": 900, "acknowledged": 0, "in_progress": 0, "resolved": 300 },
  "byIssueType": { "pothole": 600, "drainage": 600, "streetlight": 0, "water_leak": 0, "garbage": 0, "other": 0 },
  "byWard": [{ "ward": "Ward 12", "count": 60 }],
  "monthly": [{ "period": "2026-01", "count": 744 }],
  "resolvedMonthly": [{ "period": "2026-01", "count": 186 }],
  "averages": { "resolutionDays": 5, "resolvedCount": 300 }
}
```

This exists so the public page does not have to download every complaint to
count them, and it discloses **strictly less** than the list endpoint it
replaces: every figure summarises `status`, `issueType`, `location.ward` and
timestamps, all of which `GET /api/complaints` already returns in full.

`monthly` is keyed on `createdAt`; `resolvedMonthly` on `updatedAt`, for the same
reason `averages.resolutionDays` is — Complaint has no `resolvedAt`, and
`updatedAt` is the closest stored signal for when a resolved complaint was
actioned.

| Query | Effect |
|---|---|
| `from`, `to` | `createdAt` range |
| `ward` | Exact `location.ward` |
| `status`, `complaintStatus` | Complaint status |

`byDepartment` and `unassigned` are deliberately **not** included, and
`?department` is **not** honoured: `assignedDepartment` is redacted for an
unauthenticated caller on the list, so a per-department count would hand it back.
An unparseable `from`/`to` returns 400 rather than being ignored.

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
must additionally hold a staff role (`admin`, `officer` or `supervisor`).
Records `complaint_assigned` and notifies the new officer only when the
assignment actually changes.

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
