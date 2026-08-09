# Database Design

MongoDB accessed through Mongoose 8. Seven collections, defined in
`backend/src/models/`. Every schema uses `{ timestamps: true }`, adding
`createdAt` and `updatedAt`.

## Collections

| Model | Collection | Purpose |
|---|---|---|
| `User` | `users` | Accounts for every role |
| `Department` | `departments` | Municipal departments |
| `Project` | `projects` | Planned and in-progress works |
| `Conflict` | `conflicts` | Detected collisions between two projects |
| `Complaint` | `complaints` | Citizen-reported issues |
| `Notification` | `notifications` | Per-recipient notifications and email delivery state |
| `AuditLog` | `auditlogs` | Append-only record of consequential actions |

## Relationships

```
Department ─┬──< Project.department          (ObjectId ref)
            └──< Complaint.assignedDepartment (String, not a ref)

User ─┬──< Project.officer / supervisor / projectManager / createdBy
      ├──< Complaint.assignedOfficer
      ├──< Notification.recipient
      ├──< AuditLog.performedBy
      ├──< Conflict.adminResolution.resolvedBy
      └──< Conflict.officerResponse.respondedBy

Project ─┬──< Conflict.project1 / project2 / rescheduledProject
         ├──< Project.parentProject   (self-reference, phased works)
         └──> Project.clashes[]       (ObjectId refs to Conflict)
```

### Reference type inconsistency

Two fields hold a Department identifier as a `String` rather than an ObjectId
reference, so neither can be populated:

| Field | Type | Consequence |
|---|---|---|
| `User.department` | `String` | Resolved client-side through a department index built at sign-in |
| `Complaint.assignedDepartment` | `String` | Converted with `$convert` before `$lookup` in the complaint analytics pipeline |

`Project.department` is a true `ObjectId` reference and is populated normally.

## User

| Field | Type | Notes |
|---|---|---|
| `fullName` | String | Required |
| `email` | String | Required, unique, lowercased, trimmed |
| `password` | String | Required, min 8, `select: false` |
| `role` | String | Required; `admin`, `officer`, `supervisor`. There is no `citizen` account type — every citizen surface is unauthenticated |
| `department` | String | Not a reference |
| `phone`, `avatar` | String | |
| `isActive` | Boolean | Default `true` |
| `lastLogin` | Date | Set on successful login |
| `notificationPreferences` | Object | Per-channel, per-category opt-outs; default `undefined` |

Three independent controls keep the password hash out of responses:
`select: false` excludes it from queries, a pre-save hook hashes it with bcrypt
(cost 10) guarded by `isModified`, and `toJSON` deletes both `password` and
`__v`. `protect` additionally excludes it explicitly.

`matchPassword(plaintext)` compares against the stored hash and requires the
document to have been loaded with `.select("+password")`.

Preferences are embedded rather than stored separately so `protect` already has
them in memory on every authenticated request. Absent or partial values read as
opted in.

**Index:** `{ createdAt: -1 }`. `email` is unique.

## Department

| Field | Type | Notes |
|---|---|---|
| `name` | String | Required, unique, trimmed |
| `code` | String | Required, unique, trimmed, uppercased |
| `description` | String | |
| `color` | String | Default `#000000`; drives the department map layer |
| `isActive` | Boolean | Default `true` |

Departments are deactivated rather than deleted, because projects and complaints
reference them. `validateDepartmentRef` refuses to assign an inactive
department.

**Index:** `{ createdAt: -1 }`. `name` and `code` are unique.

## Project

The central entity.

| Group | Fields |
|---|---|
| Identity | `title` (req), `projectId` (unique, generated), `department` (ref, req), `projectType` (req), `description` (req) |
| Phasing | `phase` (`standalone`/`phase1`/`continuation`), `parentProject` (self-ref), `phaseNumber` |
| Timeline | `startDate` (req), `endDate` (req), `actualEndDate` |
| Budget | `estimatedCost`, `budgetSource`, `tenderNumber`, `contractorName`, `contractorFirm` |
| Location | `roadName`, `neighbourhood`, `ward`, `zone`, `city` (default `Ghaziabad`), `state` (default `Uttar Pradesh`), `address`, `centerCoords.lat` (req, `-90`–`90`), `centerCoords.lng` (req, `-180`–`180`), `shape`, `length`, `width`, `area`, `buffer`, `geoJSON` |
| MCDM | `mcdmScore`, `mcdmBreakdown`, `mcdmInputs` |
| Status | `status`, `progress` (default 0) |
| Team | `officer`, `supervisor`, `projectManager`, `createdBy` (req) |
| Admin | `adminNote`, `rejectionReason`, `suggestedDate` |
| Clash | `hasClash` (default `false`), `clashes[]` |
| Other | `documents[]`, `priority`, `isActive` (default `true`) |

**Enums**

| Field | Values |
|---|---|
| `projectType` | `road`, `water`, `sewage`, `electricity`, `parks`, `other` |
| `status` | `pending`, `approved`, `rejected`, `active`, `completed`, `rescheduled` |
| `priority` | `Low`, `Medium`, `High`, `Critical` |
| `phase` | `standalone`, `phase1`, `continuation` |
| `shape` | `corridor`, `circle`, `rectangle`, `polygon` |

**System-written fields.** Each has exactly one writer: `mcdmScore` and
`mcdmBreakdown` by the MCDM engine, `hasClash` and `clashes` by clash detection,
`actualEndDate` by the progress endpoint when progress reaches 100.

**Two notions of inactive.** `status` is the workflow state; `isActive` is the
soft-delete flag. They are independent. A project with `isActive: false` is
excluded from list and single-project reads and from clash detection; only
`PATCH /api/projects/:id/status` can restore it.

`projectId` is generated by a pre-save hook as `PRJ-` plus a zero-padded
document count. The count is not atomic, so concurrent creates can collide; the
unique index is what ultimately rejects a duplicate.

**Indexes**

| Index | Serves |
|---|---|
| `{ "location.ward": 1, status: 1 }` | Clash detection candidate selection by ward |
| `{ "location.centerCoords.lat": 1, "location.centerCoords.lng": 1 }` | Clash detection bounding-box selection |
| `{ officer: 1, createdAt: -1 }` | Officer-scoped list, newest first |
| `{ supervisor: 1, createdAt: -1 }` | Supervisor-scoped list, newest first |
| `{ department: 1, createdAt: -1 }` | Department-filtered list |
| `{ createdAt: -1 }` | Unscoped list |

`projectId` is unique.

## Conflict

| Field | Type | Notes |
|---|---|---|
| `project1`, `project2` | ObjectId ref Project | Both required; the pair is unordered |
| `clashTypes[]` | String | `geographic`, `timeline`, `worktype` |
| `severity` | String | `incompatible` (default) or `conditional` |
| `status` | String | `pending` (default), `awaiting_officer`, `resolved_both`, `resolved_rejected` |
| `adminResolution` | Object | `action` (`approve_both`/`reject_lower`), `coordinationNote`, `overrideCategory`, `overrideReason`, `overrideRef`, `resolvedBy`, `resolvedAt` |
| `officerResponse` | Object | `action` (`accept`/`custom`), `customDate`, `respondedBy`, `respondedAt` |
| `suggestedDate` | Date | Proposed new start for the rescheduled project |
| `recheckPassed` | Boolean | Whether re-running clash detection after the reschedule came back clear |
| `rescheduledProject` | ObjectId ref Project | Default `null` |
| `pairKey` | String | Required; canonical identity of the project pair, derived never supplied |

The two resolution sides are stored separately so the record shows who decided
what, rather than a single overwritten outcome.

The pair is unordered, so `pairKey` gives it one identity: the two ids sorted
and joined, computed by `Conflict.pairKeyFor` in a `pre("validate")` hook. `(A,B)`
and `(B,A)` therefore produce the same key, and a conflict is looked up by that
single value rather than by testing both orderings.

Creation goes through `clashSync.findOrCreateConflict`, which reads by `pairKey`
and, on a duplicate-key error from a concurrent caller, re-reads and returns the
row that won. Application code never writes `pairKey` itself.

**Indexes:** `{ pairKey: 1 }` **unique** — the database-level guarantee that one
project pair cannot hold two conflicts, including under concurrent creation;
`{ project1: 1, project2: 1 }` for pair lookup, `{ createdAt: -1 }` for listing.

Databases created before `pairKey` existed need `npm run migrate:conflict-pairkey`
once. It backfills the key and creates the unique index, and is idempotent. It
does not merge or delete data: if two rows already describe the same pair in
either order it reports them and exits non-zero, leaving the index uncreated so
the duplicates can be resolved by hand first.

## Complaint

| Field | Type | Notes |
|---|---|---|
| `cnrId` | String | Unique; public tracking reference, generated |
| `issueType` | String | Required; `pothole`, `streetlight`, `water_leak`, `garbage`, `drainage`, `other` |
| `description` | String | Required |
| `location` | Object | `address`, `ward`, `coords.lat` (req, `-90`–`90`), `coords.lng` (req, `-180`–`180`) |
| `photoUrl` | String | |
| `status` | String | `submitted` (default), `acknowledged`, `in_progress`, `resolved` |
| `assignedDepartment` | String | Department id held as a string |
| `assignedOfficer` | ObjectId ref User | |
| `resolutionNote` | String | |

`resolved` is terminal; there is no closed or rejected state.

`cnrId` is generated by a pre-save hook as `CNR-` plus a zero-padded count
starting at 100001. As with `projectId`, the count is not atomic and the unique
index is the real guarantee.

**Indexes**

| Index | Serves |
|---|---|
| `{ "location.ward": 1, createdAt: 1 }` | Ward complaint history, read by the MCDM condition criterion |
| `{ status: 1, createdAt: -1 }` | Status-filtered list |
| `{ assignedDepartment: 1, createdAt: -1 }` | Department-filtered list |
| `{ assignedOfficer: 1, createdAt: -1 }` | Officer-filtered list |
| `{ createdAt: -1 }` | Unfiltered list |

## Notification

| Field | Type | Notes |
|---|---|---|
| `recipient` | ObjectId ref User | Required |
| `type` | String | Required; nine values, see NOTIFICATIONS.md |
| `title`, `message` | String | Required |
| `link` | String | Client-side path |
| `data` | Object | Type-specific payload |
| `read` | Boolean | Default `false` |
| `readAt` | Date | Default `null` |
| `category` | String | `project`, `complaint`, `conflict`, `system`; default `system` |
| `priority` | String | `low`, `normal`, `high`; default `normal` |
| `archived` | Boolean | Default `false` |
| `archivedAt` | Date | Default `null` |
| `deliveryStatus` | String | `pending` (default), `sending`, `delivered`, `failed`, `skipped` |
| `deliveredAt` | Date | Default `null` |
| `retryCount` | Number | Default 0 |
| `nextAttemptAt` | Date | Default `null` |
| `lastError` | String | Default `null` |

`category` and `priority` are derived from `type` at creation rather than
supplied, so every notification of a given type is classified identically.

The row doubles as the email retry queue; no separate collection or broker
exists.

**Indexes**

| Index | Serves |
|---|---|
| `{ recipient: 1, archived: 1, createdAt: -1 }` | The feed: one recipient, archived excluded, newest first |
| `{ recipient: 1, archived: 1, read: 1 }` | Unread count and the unread filter |
| `{ deliveryStatus: 1, nextAttemptAt: 1 }` | The retry sweep |

The feed filter uses `archived: false` rather than `{ $ne: true }`. `$ne`
compiles to two open-ended index ranges, which breaks the sorted prefix and
forces a blocking in-memory sort of the recipient's entire history to return one
page; a point equality keeps the scan sorted.

Because it is an equality, it does not match a document with no `archived` field
at all. The schema defaults the field to `false`, so nothing written through the
model can look like that — only data migrated from before the field existed
would, and it would be absent from both the feed and the unread count until
backfilled.

## AuditLog

| Field | Type | Notes |
|---|---|---|
| `action` | String | Required |
| `performedBy` | ObjectId ref User | |
| `targetType` | String | Model name, as a plain string |
| `targetId` | ObjectId | Not a Mongoose reference |
| `details` | Object | Action-specific context |
| `isOverride` | Boolean | Default `false` |
| `ipAddress` | String | |

`targetType` and `targetId` form a loose polymorphic reference, deliberately not
a Mongoose ref, so an entry survives the deletion of whatever it describes.

Append-only: no endpoint updates or deletes an entry.

**Indexes:** `{ createdAt: -1 }` for the newest-first default view, and
`{ performedBy: 1, createdAt: -1 }` for the actor filter the read API exposes.

## Deletion policy

No collection is hard-deleted through the API except notifications, which the
owning recipient may delete permanently.

| Entity | Removal |
|---|---|
| User | `isActive: false` via `PATCH /api/users/:id/status` |
| Department | `isActive: false` via `PATCH /api/departments/:id/status` |
| Project | `isActive: false` via `PATCH /api/projects/:id/status` |
| Complaint | No delete endpoint |
| Conflict | No delete endpoint |
| AuditLog | No delete endpoint |
| Notification | `DELETE /api/notifications/:id` and `/bulk-delete` |
