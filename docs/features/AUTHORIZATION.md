# Authorization

Three layers apply in sequence, plus a fourth that operates on responses.

| Layer | Module | Question answered |
|---|---|---|
| Authentication | `middleware/auth.js` → `protect` | Who is the caller? |
| Role (RBAC) | `middleware/auth.js` → `authorize(...roles)` | May this role use this endpoint? |
| Ownership | `middleware/ownership.js` → `requireProjectAccess` | May this user touch this record? |
| Payload shaping | `utils/serializers.js` | May this user see everything in this response? |

`protect` must run first because both of the others read `req.user`.

## Authentication

`protect` reads the Bearer token from the `Authorization` header, verifies it
with `utils/token.verifyToken`, then loads the user with the password hash
excluded.

| Condition | Response |
|---|---|
| No token | 401 `Not authorized — no token provided` |
| Token expired | 401 `Token has expired` |
| Token invalid | 401 `Invalid token` |
| User no longer exists | 401 `User no longer exists` |
| `isActive: false` | 403 `Account is deactivated` |

The user is re-read from the database on every request rather than trusted from
the token payload. That costs one lookup per request and means a deactivated or
deleted account loses access immediately rather than when its token happens to
expire. It also guarantees `req.user._id` is always a populated ObjectId, which
the ownership checks depend on.

The token payload carries only the user id — never a role — so a stale token
cannot outlive a role change.

Expiry is reported distinctly from invalidity, letting a client refresh silently
instead of treating a routine timeout as a credential failure.

## Roles

Four roles, defined by the `User.role` enum.

| Role | Scope |
|---|---|
| `admin` | Unrestricted across the municipality |
| `officer` | Projects they own; complaints; conflicts touching their projects |
| `supervisor` | Projects they supervise |
| `citizen` | No staff endpoint |

There is no self-registration. `POST /api/auth/register` requires an
administrator session, and accepts only `officer` and `supervisor`
(`utils/validators.CREATABLE_ROLES`) — so no single request both creates a
principal and grants it unrestricted access. An `admin` is made by promoting an
existing account through `PUT /api/users/:id`.

Restricting the role enum was never on its own sufficient: an `officer` account
reads every citizen complaint unredacted (see *Complaint payload redaction*),
creates projects and reassigns complaints, so leaving the endpoint open let
anyone grant themselves that. Authentication on the route is the control; the
enum is the narrower rule layered on top.

Because every account-creating path requires an existing administrator, the
first administrator is provisioned outside the API — `npm run seed` in
development, or a direct database insert in production. There is deliberately no
unauthenticated bootstrap route.

`authorize(...roles)` is coarse-grained by design: it answers whether a role may
use an endpoint at all, never whether a user may touch a specific record.
Conflating the two is what left project ids reachable across officers before the
ownership layer existed.

## Ownership

The project visibility rule lives in exactly one module, exposed three ways so
the list and the single-resource routes cannot drift apart.

### `projectScopeFilter(user)`

Returns a Mongo filter fragment callers compose into their own query.

| Role | Filter |
|---|---|
| `admin` | `{}` — unfiltered |
| `officer` | `{ officer: user._id }` |
| `supervisor` | `{ supervisor: user._id }` |
| anything else | `DENY_ALL_PROJECTS` — matches nothing |

The last row is fail-closed, and deliberately so: a `citizen` (or any role added
later) sees no projects at all rather than an unfiltered list. `DENY_ALL_PROJECTS`
is `{ $nor: [{}] }` — expressed that way so it cannot be cancelled out by a
later `_id` spread the way a `{ _id: null }` sentinel could.

### `canAccessProject(user, project)`

Predicate over an already-loaded document. Admin always passes; an officer must
match `project.officer`; a supervisor must match `project.supervisor`. Comparison
is by string value, so an ObjectId from a lean read and a string from JSON both
match.

The two fields are never crossed: an officer does not gain access by being the
supervisor, and a role outside the three is denied.

### `requireProjectAccess(req, res, next)`

Route guard for paths addressing a single project by `:id`. It loads the project
with `projectScopeFilter` already applied and only `_id`, `officer` and
`supervisor` projected, then attaches it as `req.project`.

An invalid id returns 400 `INVALID_ID`. A project outside the caller's scope
returns **404 `PROJECT_NOT_FOUND`, not 403** — identical to a project that does
not exist, so an id cannot be probed for existence.

## Route matrix

| Route | Authentication | Roles | Ownership |
|---|---|---|---|
| `GET /api/health` | — | — | — |
| `GET /api/docs`, `/api/docs.json` | — | — | — |
| `POST /api/auth/register` | yes | admin | — |
| `POST /api/auth/login` | — | — | — |
| `POST /api/auth/logout` | yes | any | — |
| `GET /api/auth/me` | yes | any | — |
| `PUT /api/auth/profile` | yes | any | scoped to caller |
| `PUT /api/auth/password` | yes | any | scoped to caller |
| `GET /api/complaints` | — | — | payload redaction |
| `GET /api/complaints/stats` | — | — | aggregate only |
| `GET /api/complaints/:id` | — | — | payload redaction |
| `POST /api/complaints` | — | — | — |
| `PUT /api/complaints/:id` | yes | admin, officer, supervisor | — |
| `PATCH /api/complaints/:id/status` | yes | admin, officer, supervisor | — |
| `PATCH /api/complaints/:id/assign` | yes | admin, officer | — |
| `GET /api/projects/public`, `/public/:id` | — | — | status filter + field whitelist |
| `GET /api/projects` | yes | any | scope filter |
| `GET /api/projects/:id` | yes | any | `requireProjectAccess` |
| `POST /api/projects` | yes | officer, admin | — |
| `PUT /api/projects/:id` | yes | admin, officer, supervisor | `requireProjectAccess` |
| `PUT /api/projects/:id/approve` | yes | admin | — |
| `PUT /api/projects/:id/reject` | yes | admin | — |
| `PUT /api/projects/:id/progress` | yes | supervisor | `requireProjectAccess` |
| `PATCH /api/projects/:id/status` | yes | admin | — |
| `GET /api/conflicts` | yes | any | payload redaction |
| `GET /api/conflicts/:id` | yes | any | payload redaction |
| `PUT /api/conflicts/:id/resolve` | yes | admin | — |
| `PUT /api/conflicts/:id/respond` | yes | officer | `canAccessProject` in controller |
| `GET`, `POST /api/departments` | yes | any / admin | — |
| `GET`, `PUT /api/departments/:id` | yes | any / admin | — |
| `PATCH /api/departments/:id/status` | yes | admin | — |
| All `/api/users` | yes | admin | — |
| All `/api/audit` | yes | admin | — |
| All `/api/dashboard` | yes | admin | — |
| `GET /api/notifications/stream` | ticket → `protect` | any | recipient scope |
| All other `/api/notifications` | yes | any | recipient scope |

Admin-only project routes carry no ownership guard because an administrator is
unrestricted by that rule; adding one would be redundant.

## Complaints are unauthenticated for read and create

`GET /api/complaints`, `GET /api/complaints/stats`, `GET /api/complaints/:id` and
`POST /api/complaints` carry no `protect`. This supports the public citizen
flow: a resident submits a report and tracks it by its `cnrId` without an
account.

The consequences are visible in the implementation:

- Any caller can list and search complaints, including `description` and
  `location.ward`. The payload is shaped for them, though: an unauthenticated
  caller never receives `assignedOfficer`, `assignedDepartment`, `photoUrl`,
  `resolutionNote`, `location.coords` or `location.address`, so the public view
  exposes neither the reporter's exact whereabouts nor the internal workload.
  See *Complaint payload redaction* below. The list is also **capped at 200
  records** without `?page`/`?limit`, so being public does not make it a way to
  pull an unbounded collection in one request.
- `GET /stats` returns city-wide counts only — no documents. It is what the
  public dashboard reads instead of counting a downloaded table, and it
  discloses strictly less than the list: every figure summarises `status`,
  `issueType`, `location.ward` and timestamps, which the list already returns in
  full. `byDepartment` and `unassigned` are omitted and `?department` is not
  honoured, because `assignedDepartment` is one of the redacted fields.
- `POST` accepts only what a reporter supplies — `issueType`, `description`,
  `location` and `photoUrl`. `status`, `assignedDepartment` and
  `assignedOfficer` are server-owned: a complaint always begins `submitted` and
  unassigned, and only the role-gated `PATCH /:id/status` and `PATCH /:id/assign`
  move it from there. Values supplied for them are dropped, not rejected.

All complaint mutation routes are role-gated.

## The public project portal is whitelisted, not redacted

`GET /api/projects/public` and `GET /api/projects/public/:id` carry no
`protect` either, backing the citizen transparency portal. Unlike the
complaint routes, this is not the same query with fields stripped afterwards:
`serialisePublicProject` builds a new object naming only the fields a resident
may see — `id`, `title`, `description`, `department` (code and name),
`projectType`, `status`, `progress`, `startDate`, `endDate`, `actualEndDate`
and `location` (ward, zone, address, city, state, centerCoords). A field added
to `Project` later is withheld by default rather than leaking until someone
remembers to hide it.

The query itself is also scoped, to `status` in `approved`, `active`,
`completed` or `rescheduled` and `isActive: true`. A `pending` project is still
under internal review and a `rejected` one never happened, so neither is
public; a project outside that set returns 404 by id, identical to one that
does not exist.

## Conflict payload redaction

A conflict embeds two projects. Without shaping, the conflict endpoints would
return project detail that the project routes refuse, making the conflict list a
way around the ownership boundary.

`utils/serializers.js` reapplies the rule to the response:

- `redactProjectRef(project, user)` returns the project unchanged when
  `canAccessProject` passes, and collapses it to its bare `_id` otherwise.
- `serialiseConflict` / `serialiseConflicts` apply that to `project1` and
  `project2` and always return plain objects.

The reference survives so the conflict remains coherent — which projects clash is
not the secret; their titles, departments, MCDM scores and coordinates are. The
frontend adapter treats an unpopulated reference as "details unavailable".

The populated projection includes `supervisor` alongside `officer` specifically
so the rule can be evaluated for supervisors; without it every conflict would
redact for them, including their own projects.

## Complaint payload redaction

The complaint read routes are public, so the shaping layer — not a route guard —
is what keeps the citizen-facing view from exposing internal state. It is keyed
on whether `optionalAuth` attached a user, so it is a property of the caller, not
of the record.

`serialiseComplaint` / `serialiseComplaints` remove six fields when there is no
session:

| Field | Why |
|---|---|
| `assignedOfficer`, `assignedDepartment` | Internal workload allocation |
| `resolutionNote` | Internal handling notes |
| `photoUrl` | Reporter-supplied imagery |
| `location.coords`, `location.address` | The reporter's exact whereabouts |

`location.ward` deliberately survives, because the public citizen dashboard
aggregates by ward. Everything else a resident needs to track a report — `cnrId`,
`status`, `issueType`, `description`, timestamps — is untouched.

## Notification ownership

Notification routes take no ownership middleware. Every query in
`notificationService` is scoped to `recipient` in the filter itself, so ownership
is enforced by construction rather than by a separate check that could be
forgotten.

Reads for another recipient return `null`, which the controller reports as 404.
Bulk archive and delete first read the matching ids restricted to the recipient,
so ids belonging to another user are silently excluded rather than failing the
request.

## Stream authentication

`EventSource` cannot set an `Authorization` header. Rather than accepting a
session JWT in the URL, `POST /api/notifications/stream-ticket` issues a
single-use ticket valid for 30 seconds, signed with the same `JWT_SECRET` through
the same token helpers.

`streamAuth` in `routes/notifications.js` consumes the ticket, exchanges it for a
Bearer header, and delegates to the unmodified `protect`. Account state and role
checks therefore run through the one authentication pipeline.

`consumeTicket` rejects a ticket that is invalid, expired, of the wrong type or
already used. A session JWT is refused because it carries no `typ: "sse"` claim.
Consumed ticket ids are held only until they would have expired anyway, so the
ledger is bounded by ticket lifetime rather than by traffic.

## Data exposure controls

| Control | Location |
|---|---|
| Password hash excluded from queries | `User` schema `select: false` |
| Password hash stripped from serialisation | `User.toJSON` |
| Password hash excluded by the auth middleware | `protect` |
| Project detail redacted inside conflicts | `utils/serializers.js` |
| Complaint detail redacted for unauthenticated readers | `utils/serializers.js` |
| Referenced users constrained to the role that can act | `utils/refValidators.validateUserRef` |
| Stack traces suppressed outside development | `middleware/error.js` |
| Validation details suppressed in production | `utils/apiResponse.fail` |
| Server error text generalised in production | `utils/apiResponse.serverError` and `middleware/error.js` — both 500 paths |
| Secrets redacted from logs | `utils/logger.scrub` |
| Health endpoint reports state, never configuration | `routes/health.js` |

## Account enumeration resistance

`POST /api/auth/login` returns one message — `Invalid email or password` — for an
unknown email, a wrong password and an inactive account. `validateLoginInput`
checks only presence, deliberately applying no format rule that would let a
caller distinguish which half of the credentials was wrong.

`POST /api/auth/register` reports a duplicate email plainly, which it must to be
usable. That is not an enumeration vector: the route is administrator-only, and
an administrator can already list every account through `GET /api/users`.

## Test coverage

| Suite | Covers |
|---|---|
| `test/unit/ownership.test.js` | Scope filters, `canAccessProject`, field isolation, value comparison |
| `test/unit/serializers.test.js` | Redaction, mixed ownership, metadata survival, no source mutation |
| `test/unit/streamTicket.test.js` | Single use, expiry, wrong secret, session-JWT rejection |
| `test/integration/api.test.js` | Live RBAC per role, cross-officer access, 404-not-403, enumeration resistance, absence of password hashes |
