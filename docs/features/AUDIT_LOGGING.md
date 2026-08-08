# Audit Logging

An append-only record of consequential actions, written from inside the business
operation it describes.

| Concern | Location |
|---|---|
| Writer | `backend/src/services/auditService.js` |
| Model | `backend/src/models/AuditLog.js` |
| Read API | `backend/src/controllers/auditController.js` |
| Analytics | `backend/src/services/analyticsService.js` → `getActivityAnalytics` |

`auditService.recordAudit` is the only writer. No endpoint creates, updates or
deletes an entry, so the trail cannot be altered through the API.

## Record shape

| Field | Type | Notes |
|---|---|---|
| `action` | String | Required; see the action table below |
| `performedBy` | ObjectId → User | From the explicit argument, or `req.user._id` |
| `targetType` | String | Model name as a plain string |
| `targetId` | ObjectId | Not a Mongoose reference |
| `details` | Object | Action-specific context |
| `isOverride` | Boolean | Default `false` |
| `ipAddress` | String | Resolved from the request |
| `createdAt`, `updatedAt` | Date | From `timestamps: true` |

`targetType` and `targetId` form a loose polymorphic reference, deliberately not
a Mongoose ref, so an entry survives the deletion of whatever it describes.

## Recorded actions

Twenty actions are written by the current implementation.

| Action | Source | `targetType` | `details` |
|---|---|---|---|
| `project_created` | `projectsController.createProject` | Project | — |
| `project_updated` | `projectsController.updateProject` | Project | — |
| `project_approved` | `projectsController.approveProject` | Project | — |
| `project_rejected` | `projectsController.rejectProject` | Project | `{ reason }` |
| `project_status_updated` | `projectsController.updateProjectStatus` | Project | `{ isActive }` |
| `progress_updated` | `projectsController.updateProgress` | Project | `{ progress }` |
| `conflict_resolved` | `conflictsController.resolveConflict` | Conflict | The full request body |
| `conflict_responded` | `conflictsController.officerRespond` | Conflict | `{ action, customDate, newStartDate, recheckPassed }` |
| `complaint_created` | `complaintsController.createComplaint` | Complaint | `{ cnrId, issueType }` |
| `complaint_updated` | `complaintsController.updateComplaint` | Complaint | `{ fields }` |
| `complaint_status_updated` | `complaintsController.updateStatus` | Complaint | `{ status }` |
| `complaint_assigned` | `complaintsController.assignComplaint` | Complaint | `{ assignedDepartment, assignedOfficer }` |
| `profile_updated` | `authController.updateProfile` | User | — |
| `password_changed` | `authController.changePassword` | User | — |
| `user_created` | `authController.register` | User | `{ role }` |
| `user_updated` | `usersController.updateUser` | User | `{ fields }`, plus `{ role: { from, to } }` when the role changed |
| `user_status_updated` | `usersController.updateUserStatus` | User | `{ isActive }` |
| `department_created` | `departmentController.createDepartment` | Department | `{ name, code }` |
| `department_updated` | `departmentController.updateDepartment` | Department | `{ fields }` |
| `department_status_updated` | `departmentController.updateDepartmentStatus` | Department | `{ isActive }` |

`action` is a free-form `String` on the schema, not an enum, so this list
reflects the call sites rather than a schema constraint.

User administration and department changes are recorded because they are the
most privilege-relevant operations in the system: promotion to `admin` and
deactivation both decide who holds access, and the trail has to be able to say
who granted it. Each entry is written **after** the write succeeds, so an
operation the administrative lockout guards refuse leaves no record at all.

`user_updated` records field *names* and the role transition, never values —
the writable set is `fullName`, `phone`, `avatar`, `role` and `department`, none
of which is a credential. No audited action anywhere records a password, token
or secret.

Notification lifecycle actions are not audited.

## Override marking

`isOverride` is set to `true` only by `conflictsController.resolveConflict`, and
only when the request body carries an `overrideCategory`. It marks an
administrator overruling a system recommendation, which is the case reviewers
look for first.

`overrideCategory`, `overrideReason` and `overrideRef` are also persisted on the
`Conflict` document itself under `adminResolution`, so the justification survives
alongside the decision as well as in the trail.

`GET /api/dashboard/activity` and `GET /api/dashboard/summary` both report an
override count.

## Failure isolation

`recordAudit` catches every error, logs it through the structured logger and
returns `null`.

A controller awaits `recordAudit` only after its business write has already
succeeded. An audit failure therefore must not turn a completed action into an
error response — the same contract the notification dispatchers follow.

The consequence is explicit: the trail is best-effort. A write that fails is
logged but not retried, and the business operation still reports success.

## Client IP resolution

`getClientIp(req)` returns `req.ip`, falling back to `req.socket.remoteAddress`.

`req.ip` is derived by Express from the `trust proxy` setting, which `app.js`
reads from `TRUST_PROXY`. The recorded address is therefore only as trusted as
the deployment declares: the socket address when no proxy is configured, and the
forwarded client address when one is. Reading `x-forwarded-for` directly would
let any caller choose the address written to the trail.

## Reading the trail

Both routes are administrator-only and read-only.

### `GET /api/audit`

Returns a bare array, newest first, with `performedBy` populated as `fullName`,
`role` and `department`.

Without pagination the response is capped at 200 records, because the trail
grows without bound and the default view shows only recent activity. `?page` and
`?limit` enable full pagination with the standard `X-Total-*` headers.

Filters are applied by the server, so they narrow the whole trail rather than
only the rows already returned: `action`, `performedBy` (a User ObjectId),
`targetType`, `isOverride` (`true`/`false`) and the `from`/`to` `createdAt`
range. A malformed `performedBy` or a non-boolean `isOverride` returns 400. When
paginated, the reported total counts the filtered set.

### `GET /api/audit/:id`

Returns one entry, or 404 `AUDIT_LOG_NOT_FOUND`.

## Analytics

`getActivityAnalytics` reports totals, the override count, breakdowns by action
and target type, a monthly series, and the most recent entries. The recent list
defaults to 20 and is capped at 100 via `?limit`.

The aggregation and the recent-entries read run concurrently.

Filters accepted: `from` and `to` only. `department`, `priority`, `ward` and
`status` do not apply, because the audit record carries none of those fields.

## Storage characteristics

The collection is append-only and has no TTL index or retention policy, so it
grows without bound. Two indexes serve it: `{ createdAt: -1 }` for the
newest-first list and the monthly aggregation, and `{ performedBy: 1,
createdAt: -1 }` for the actor filter — without the second, `?performedBy` was
answered by walking the whole trail, which is the one filter selective enough
for that to matter. The remaining filters (`action`, `targetType`,
`isOverride`) are low-cardinality and are still satisfied from the sort index.

## Relationship to application logging

Audit logging and application logging are separate systems with different
purposes and audiences.

| | Audit trail | Application log |
|---|---|---|
| Module | `services/auditService.js` | `utils/logger.js` |
| Destination | MongoDB | stdout / stderr |
| Records | Business actions | Diagnostics, errors, request timing |
| Audience | Administrators, via the API | Operators |
| Retention | Indefinite | Per the log collector |
| Correlation | None stored | `requestId` on every line |

An audit entry does not carry the request correlation id, so joining a trail
entry to its log lines is not directly supported.
