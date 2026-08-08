// OpenAPI path definitions, mirroring src/routes/*.js. The guard notation in
// each summary reflects the real middleware chain: `public` is no protect,
// `auth` is protect alone, and a role name adds authorize().

const ref = (s) => ({ $ref: `#/components/schemas/${s}` })
const res$ = (r) => ({ $ref: `#/components/responses/${r}` })
const param$ = (p) => ({ $ref: `#/components/parameters/${p}` })

const PAGED = [param$("PageParam"), param$("LimitParam")]
const PAGE_HEADERS = {
  "X-Total-Count": { $ref: "#/components/headers/XTotalCount" },
  "X-Page": { $ref: "#/components/headers/XPage" },
  "X-Limit": { $ref: "#/components/headers/XLimit" },
  "X-Total-Pages": { $ref: "#/components/headers/XTotalPages" },
  "X-Has-Next": { $ref: "#/components/headers/XHasNext" },
  "X-Has-Previous": { $ref: "#/components/headers/XHasPrevious" },
}

const json = (schema) => ({ content: { "application/json": { schema } } })
const body = (schema, required = true) => ({ required, content: { "application/json": { schema } } })
const arrayOf = (s) => ({ type: "array", items: ref(s) })
const envelope = (key, schema) => ({
  type: "object",
  properties: { success: { type: "boolean", example: true }, [key]: schema },
})

// 429 appears in both families: the shared limiter covers every /api route.
const ENV_GUARDS = { 401: res$("EnvUnauthorized"), 403: res$("EnvForbidden"), 429: res$("EnvRateLimited"), 500: res$("EnvServerError") }
const PLAIN_GUARDS = { 401: res$("Unauthorized"), 403: res$("Forbidden"), 429: res$("RateLimited"), 500: res$("ServerError") }

module.exports = {
  "/api/health": {
    get: {
      tags: ["Health"], summary: "Service and database health (public)",
      security: [],
      responses: {
        200: {
          description: "Service is up. `database` reflects the live Mongoose connection state.",
          ...json({
            type: "object",
            properties: {
              status: { type: "string", example: "ok" },
              uptime: { type: "number", example: 12.34 },
              timestamp: { type: "string", format: "date-time" },
              environment: { type: "string", example: "development" },
              database: { type: "string", enum: ["disconnected", "connected", "connecting", "disconnecting", "unknown"] },
              subsystems: {
                type: "object",
                description: "Per-subsystem detail. Optional infrastructure reports \"disabled\", never \"down\": running without Redis or Brevo is a supported configuration.",
                properties: {
                  mongodb: { type: "string" },
                  redis: { type: "string", enum: ["connected", "disabled"] },
                  email: { type: "string", enum: ["configured", "disabled"] },
                  notificationStream: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ready" },
                      recipients: { type: "integer" },
                      connections: { type: "integer" },
                    },
                  },
                },
              },
            },
          }),
        },
        429: res$("RateLimited"),
      },
    },
  },

  "/api/auth/register": {
    post: {
      tags: ["Auth"], summary: "Create a staff account (admin)",
      description:
        "Account creation is an administrative act — this endpoint is **not** self-service and requires an administrator session. " +
        "`role` is restricted to `officer` and `supervisor`; requesting `admin` returns 400, so no single request both creates a principal and grants it unrestricted access. Promote an account to `admin` afterwards with `PUT /api/users/{id}`. " +
        "Because every account-creating path requires an existing administrator, the first one is provisioned outside the API (the seed, or a direct insert).",
      requestBody: body({
        type: "object", required: ["fullName", "email", "password", "role"],
        properties: {
          fullName: { type: "string" },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          role: { type: "string", enum: ["officer", "supervisor"] },
          phone: { type: "string" },
        },
        example: { fullName: "Anil Sharma", email: "anil@civiq.in", password: "SecurePass123", role: "officer", phone: "9876543210" },
      }),
      responses: {
        201: { description: "Created.", ...json(envelope("user", ref("User"))) },
        400: res$("EnvValidation"),
        409: errEx("An account with this email already exists"),
        ...ENV_GUARDS,
      },
    },
  },
  "/api/auth/login": {
    post: {
      tags: ["Auth"], summary: "Authenticate and receive a JWT (public)",
      security: [],
      requestBody: body({
        type: "object", required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
        example: { email: "admin@civiq.in", password: "AdminPass123" },
      }),
      responses: {
        200: {
          description: "Authenticated. `lastLogin` is updated as a side effect.",
          ...json({
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
              message: { type: "string", example: "Login successful" },
              token: { type: "string" },
              user: ref("User"),
            },
          }),
        },
        400: res$("EnvValidation"),
        401: errEx("Invalid email or password"),
        429: res$("EnvRateLimited"),
        500: res$("EnvServerError"),
      },
    },
  },
  "/api/auth/logout": {
    post: {
      tags: ["Auth"], summary: "Logout (auth)",
      description: "Stateless JWT: the server holds no session and does not blacklist the token. The client must discard it; the token remains technically valid until it expires.",
      responses: {
        200: { description: "Acknowledged.", ...json({ type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } }) },
        401: res$("EnvUnauthorized"),
        429: res$("EnvRateLimited"),
      },
    },
  },
  "/api/auth/me": {
    get: {
      tags: ["Auth"], summary: "Current authenticated user (auth)",
      responses: {
        200: { description: "The authenticated user.", ...json(envelope("user", ref("User"))) },
        401: res$("EnvUnauthorized"),
        403: errEx("Account is deactivated"),
        429: res$("EnvRateLimited"),
      },
    },
  },
  "/api/auth/profile": {
    put: {
      tags: ["Auth"], summary: "Update the caller's own profile (auth)",
      description:
        "Self-service, distinct from the admin-only `PUT /api/users/{id}`: always scoped to the authenticated caller, and the writable set is narrower — `role`, `department`, `isActive` and `email` cannot be reached here at all, so there is no path from this endpoint to a privilege change. " +
        "Writes are recorded as a `profile_updated` audit entry.",
      requestBody: body({
        type: "object",
        properties: { fullName: { type: "string" }, phone: { type: "string" }, avatar: { type: "string" } },
        example: { fullName: "Anil Sharma", phone: "9876543210" },
      }),
      responses: {
        200: { description: "Updated.", ...json(envelope("user", ref("User"))) },
        400: res$("EnvValidation"),
        ...ENV_GUARDS,
      },
    },
  },
  "/api/auth/password": {
    put: {
      tags: ["Auth"], summary: "Change the caller's own password (auth)",
      description:
        "Requires the current password; a wrong one returns 400, not 401, so a typo does not trip the client's global logout-on-401 handling. " +
        "`newPassword` follows the same policy as registration (minimum 8 characters). `confirmPassword`, if supplied, must match `newPassword`. " +
        "The session token remains valid afterwards — it is a stateless JWT carrying only the user id, not a password fingerprint, so there is no server-side session to revoke. Recorded as a `password_changed` audit entry. Shares `/api/auth/login`'s rate-control budget.",
      requestBody: body({
        type: "object", required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
          confirmPassword: { type: "string" },
        },
        example: { currentPassword: "OldPass123", newPassword: "NewPass456", confirmPassword: "NewPass456" },
      }),
      responses: {
        200: { description: "Changed.", ...json({ type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } }) },
        400: errEx("Current password is incorrect"),
        ...ENV_GUARDS,
      },
    },
  },

  "/api/config/wards": {
    get: {
      tags: ["Config"], summary: "List the municipal ward register (auth)",
      description:
        "Read-only lookup configuration, served from `config/staticConfig.wards`. There is no ward collection and no way to modify the register through the API — it is redrawn by municipal notification, not by an operator.\n\n" +
        "Client ward selectors read this rather than carrying their own copy, so the values offered are always the ones the backend reasons about. `Project.location.ward` drives clash-detection candidate selection, the MCDM condition criterion and every ward analytic; a value outside this register degrades all three, which is why the list is served rather than duplicated.",
      responses: {
        200: {
          description: "The ward register, in register order.",
          ...json({
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
              count: { type: "integer", example: 9 },
              wards: { type: "array", items: { type: "string" }, example: ["Ward 3", "Ward 5", "Ward 6"] },
            },
          }),
        },
        ...ENV_GUARDS,
      },
    },
  },

  "/api/departments": {
    get: {
      tags: ["Departments"], summary: "List departments (auth)",
      parameters: PAGED,
      responses: {
        200: { description: "Departments, newest first.", headers: PAGE_HEADERS, ...json({ type: "object", properties: { success: { type: "boolean" }, count: { type: "integer" }, departments: arrayOf("Department") } }) },
        ...ENV_GUARDS,
      },
    },
    post: {
      tags: ["Departments"], summary: "Create a department (admin)",
      description: "Recorded as a `department_created` audit entry.",
      requestBody: body({
        type: "object", required: ["name", "code"],
        properties: { name: { type: "string" }, code: { type: "string" }, description: { type: "string" }, color: { type: "string" } },
        example: { name: "Public Works", code: "PWD", description: "Roads and civil works", color: "#2563EB" },
      }),
      responses: {
        201: { description: "Created.", ...json(envelope("department", ref("Department"))) },
        400: { description: "Missing name/code, duplicate name or code, or schema validation failure. Note: duplicates return **400** here, not 409.", ...json(ref("EnvelopeError")) },
        ...ENV_GUARDS,
      },
    },
  },
  "/api/departments/{id}": {
    get: {
      tags: ["Departments"], summary: "Get one department (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found.", ...json(envelope("department", ref("Department"))) }, 400: res$("EnvValidation"), 404: res$("EnvNotFound"), ...ENV_GUARDS },
    },
    put: {
      tags: ["Departments"], summary: "Update a department (admin)",
      description: "`isActive` is deliberately NOT updatable here — use `PATCH /{id}/status`. Recorded as a `department_updated` audit entry naming the fields supplied.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", properties: { name: { type: "string" }, code: { type: "string" }, description: { type: "string" }, color: { type: "string" } } }),
      responses: { 200: { description: "Updated.", ...json(envelope("department", ref("Department"))) }, 400: res$("EnvValidation"), 404: res$("EnvNotFound"), ...ENV_GUARDS },
    },
  },
  "/api/departments/{id}/status": {
    patch: {
      tags: ["Departments"], summary: "Activate / deactivate a department (admin)",
      description: "Recorded as a `department_status_updated` audit entry.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", required: ["isActive"], properties: { isActive: { type: "boolean" } }, example: { isActive: false } }),
      responses: { 200: { description: "Updated.", ...json(envelope("department", ref("Department"))) }, 400: res$("EnvValidation"), 404: res$("EnvNotFound"), ...ENV_GUARDS },
    },
  },

  "/api/users": {
    get: {
      tags: ["Users"], summary: "List users (admin)",
      parameters: PAGED,
      responses: {
        200: { description: "Users, newest first. Passwords are never returned.", headers: PAGE_HEADERS, ...json({ type: "object", properties: { success: { type: "boolean" }, count: { type: "integer" }, users: arrayOf("User") } }) },
        ...ENV_GUARDS,
      },
    },
  },
  "/api/users/{id}": {
    get: {
      tags: ["Users"], summary: "Get one user (admin)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found.", ...json(envelope("user", ref("User"))) }, 400: res$("EnvValidation"), 404: res$("EnvNotFound"), ...ENV_GUARDS },
    },
    put: {
      tags: ["Users"], summary: "Update a user (admin)",
      description:
        "Only the listed fields are read from the body. `password`, `email`, `_id`, `isActive` and timestamps are ignored if supplied. `department` must be an ObjectId of an existing, active Department. " +
        "Two lockout guards apply to `role` and are checked before any write, so a rejected request leaves the account unchanged: an administrator cannot demote themselves (400), and no `role` change may leave the system with zero active administrators (400). " +
        "A successful update is recorded as a `user_updated` audit entry naming the fields written and, when the role changed, the transition. A rejected one records nothing.",
      parameters: [param$("IdParam")],
      requestBody: body({
        type: "object",
        properties: {
          fullName: { type: "string" }, phone: { type: "string" }, avatar: { type: "string" },
          role: { type: "string", enum: ["admin", "officer", "supervisor"] },
          department: { type: "string", description: "Department ObjectId; must exist and be active." },
        },
      }),
      responses: { 200: { description: "Updated.", ...json(envelope("user", ref("User"))) }, 400: res$("EnvValidation"), 404: res$("EnvNotFound"), ...ENV_GUARDS },
    },
  },
  "/api/users/{id}/status": {
    patch: {
      tags: ["Users"], summary: "Activate / deactivate a user (admin)",
      description:
        "Deactivation is guarded against administrative lockout, checked before any write so a rejected request leaves the account unchanged: an administrator cannot deactivate their own account (400), and the last active administrator cannot be deactivated (400). Activation is never blocked. " +
        "A successful change is recorded as a `user_status_updated` audit entry; a rejected one records nothing.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", required: ["isActive"], properties: { isActive: { type: "boolean" } } }),
      responses: { 200: { description: "Updated.", ...json(envelope("user", ref("User"))) }, 400: res$("EnvValidation"), 404: res$("EnvNotFound"), ...ENV_GUARDS },
    },
  },

  "/api/projects/public": {
    get: {
      tags: ["Projects"], summary: "List public projects (PUBLIC — no authentication)",
      description:
        "The citizen transparency portal's project list. Scoped to `status` in `approved`, `active`, `completed` or `rescheduled` — a project still `pending` review or `rejected` is never returned — and to `isActive: true`. " +
        "The response is whitelisted by `serialisePublicProject`, not redacted from the full document: only `id`, `title`, `description`, `department` (code and name), `projectType`, `status`, `progress`, `startDate`, `endDate`, `actualEndDate` and `location` (ward, zone, address, city, state, centerCoords) are present. Officer, supervisor, MCDM score, clash state and every other internal field are absent, not merely hidden.",
      security: [],
      parameters: PAGED,
      responses: { 200: { description: "Public projects, newest first.", headers: PAGE_HEADERS, ...json({ type: "array", items: ref("PublicProject") }) }, 429: res$("RateLimited"), 500: res$("ServerError") },
    },
  },
  "/api/projects/public/{id}": {
    get: {
      tags: ["Projects"], summary: "Get one public project (PUBLIC — no authentication)",
      description: "Same scope and field whitelist as the list. A project outside the public statuses returns 404, identical to one that does not exist.",
      security: [],
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found.", ...json(ref("PublicProject")) }, 400: res$("Validation"), 404: res$("NotFound"), 429: res$("RateLimited"), 500: res$("ServerError") },
    },
  },
  "/api/projects": {
    get: {
      tags: ["Projects"], summary: "List projects (auth)",
      description:"Results are role-scoped by the controller: `admin` sees every project, `officer` only those where they are the officer, and `supervisor` only those where they are the supervisor. Any other authenticated role sees none; the scope is fail-closed rather than unfiltered. Soft-deleted projects are excluded. Returns a raw array.",
      parameters: PAGED,
      responses: { 200: { description: "Projects, newest first.", headers: PAGE_HEADERS, ...json(arrayOf("Project")) }, ...PLAIN_GUARDS },
    },
    post: {
      tags: ["Projects"], summary: "Create a project (officer, admin)",
      description:
        "On create the server: computes the MCDM score, runs clash detection, creates any missing Conflict records (duplicate pairs are not re-created), notifies the officer, and writes an audit entry. " +
        "`officer` and `createdBy` are set from the authenticated user; `department` falls back to the caller's own department when omitted.",
      requestBody: body({
        type: "object", required: ["title", "projectType", "description", "startDate", "endDate", "location"],
        properties: {
          title: { type: "string" },
          department: { type: "string", description: "Department ObjectId; must exist and be active. Falls back to the caller's department if omitted." },
          projectType: { type: "string", enum: ["road", "water", "sewage", "electricity", "parks", "other"] },
          description: { type: "string" },
          startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" },
          location: ref("ProjectLocation"),
          mcdmInputs: ref("McdmInputs"),
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          projectManager: { type: "string", description: "User ObjectId; must exist, be active, and hold a staff role (admin, officer or supervisor)." },
          supervisor: { type: "string", description: "User ObjectId; must exist, be active, and hold the `supervisor` role — `PUT /{id}/progress` is gated on that role, so any other assignee leaves the project impossible to complete." },
          estimatedCost: { type: "number" }, budgetSource: { type: "string" },
          tenderNumber: { type: "string" }, contractorName: { type: "string" }, contractorFirm: { type: "string" },
        },
        example: {
          title: "MG Road Resurfacing", department: "6a71...", projectType: "road",
          description: "Resurfacing of MG Road", startDate: "2026-02-01", endDate: "2026-04-01",
          location: { ward: "Ward 12", centerCoords: { lat: 28.67, lng: 77.45 } },
          mcdmInputs: { conditionRating: "poor" },
        },
      }),
      responses: {
        201: {
          description: "Created.",
          ...json({ type: "object", properties: { project: ref("Project"), mcdm: { type: "object", properties: { score: { type: "number" }, breakdown: { type: "object" }, outOf100: { type: "number" } } }, clashesDetected: { type: "integer" } } }),
        },
        400: res$("Validation"), 409: res$("ConflictErr"), ...PLAIN_GUARDS,
      },
    },
  },
  "/api/projects/{id}": {
    get: {
      tags: ["Projects"], summary: "Get one project (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found, with officer, supervisor, department and projectManager populated. `clashes` stays a plain id array — it is deliberately not hydrated.", ...json(ref("Project")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
    put: {
      tags: ["Projects"], summary: "Update a project (admin, officer, supervisor)",
      description:
        "The same fields listed for POST are writable, `supervisor` among them, and each is validated the same way. " +
        "Everything else is server-owned and ignored if supplied — `officer`, `createdBy`, `projectId`, `status`, `isActive`, " +
        "`progress`, `actualEndDate`, `mcdmScore`, `mcdmBreakdown`, `hasClash`, `clashes`, `adminNote`, `rejectionReason` and " +
        "`suggestedDate` each have their own endpoint or are set by the engines. `endDate` is validated against the effective `startDate`.\n\n" +
        "A `completed` or `rejected` project returns 409 and is left untouched: finished work is a historical record, and moving " +
        "`startDate` after completion would leave `actualEndDate` before it, which the project analytics report as a negative " +
        "average duration.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", description: "The writable Project fields listed above. Unknown or server-owned fields are ignored rather than rejected.", additionalProperties: true }),
      responses: {
        200: { description: "Updated.", ...json(ref("Project")) },
        400: res$("Validation"), 404: res$("NotFound"),
        409: { description: "The project is `completed` or `rejected`, so it can no longer be edited. Nothing is written.", ...json(ref("PlainError")) },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/projects/{id}/approve": {
    put: {
      tags: ["Projects"], summary: "Approve a project (admin)",
      description: "Applies only to a project still in `pending`; a project already approved, rejected, completed or rescheduled returns 409.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", properties: { note: { type: "string" } } }, false),
      responses: {
        200: { description: "Approved; officer notified and audit written.", ...json(ref("Project")) },
        400: res$("Validation"), 404: res$("NotFound"),
        409: { description: "The project is not pending, so it has already been decided.", ...json(ref("PlainError")) },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/projects/{id}/reject": {
    put: {
      tags: ["Projects"], summary: "Reject a project (admin)",
      description: "Applies only to a project still in `pending`; a project already approved, rejected, completed or rescheduled returns 409.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", properties: { reason: { type: "string" }, suggestedDate: { type: "string", format: "date" } } }, false),
      responses: {
        200: { description: "Rejected; officer notified and audit written.", ...json(ref("Project")) },
        400: res$("Validation"), 404: res$("NotFound"),
        409: { description: "The project is not pending, so it has already been decided.", ...json(ref("PlainError")) },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/projects/{id}/progress": {
    put: {
      tags: ["Projects"], summary: "Update progress (supervisor)",
      description:
        "Setting `progress` to 100 also sets `status` to `completed` and stamps `actualEndDate`. " +
        "Applies only to authorised work: `status` must be `approved` or `active`. A `pending` project returns 409 — " +
        "progress cannot be recorded before an administrator has approved it, and allowing it would drive the project to " +
        "`completed`, which locks out both approve and reject since those require `pending`. `rescheduled`, `completed` " +
        "and `rejected` return 409 for the same reason.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", required: ["progress"], properties: { progress: { type: "number", minimum: 0, maximum: 100 } } }),
      responses: {
        200: { description: "Updated.", ...json(ref("Project")) },
        400: res$("Validation"), 404: res$("NotFound"),
        409: { description: "The project is not `approved` or `active`, so progress does not apply to it yet (or any longer).", ...json(ref("PlainError")) },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/projects/{id}/status": {
    patch: {
      tags: ["Projects"], summary: "Activate / deactivate a project — soft delete (admin)",
      description: "Soft delete only. Records are never removed from the database.",
      parameters: [param$("IdParam")],
      requestBody: body({ type: "object", required: ["isActive"], properties: { isActive: { type: "boolean" } } }),
      responses: { 200: { description: "Updated.", ...json(ref("Project")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },

  "/api/conflicts": {
    get: {
      tags: ["Conflicts"], summary: "List conflicts (auth)",
      parameters: PAGED,
      responses: { 200: { description: "Conflicts, newest first, with both projects (and their departments) populated.", headers: PAGE_HEADERS, ...json(arrayOf("Conflict")) }, ...PLAIN_GUARDS },
    },
  },
  "/api/conflicts/{id}": {
    get: {
      tags: ["Conflicts"], summary: "Get one conflict (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found.", ...json(ref("Conflict")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },
  "/api/conflicts/{id}/resolve": {
    put: {
      tags: ["Conflicts"], summary: "Resolve a conflict (admin)",
      description:
        "`approve_both` authorises both projects to proceed: one still awaiting a decision moves to `approved` and its officer is notified, while one that is already `approved` or `active` keeps the position it has reached — an in-flight project is not rolled back, and its officer is not told again about an approval they already hold. " +
        "`reject_lower` defers whichever project has the LOWER mcdmScore, sets its suggested start date, records `rescheduledProject`, and moves the conflict to `awaiting_officer`. " +
        "Supplying `overrideCategory` marks the audit entry as an override. Only a conflict in `pending` status can be resolved.",
      parameters: [param$("IdParam")],
      requestBody: body({
        type: "object", required: ["action"],
        properties: {
          action: { type: "string", enum: ["approve_both", "reject_lower"] },
          coordinationNote: { type: "string" }, overrideCategory: { type: "string" },
          overrideReason: { type: "string" }, overrideRef: { type: "string" },
        },
        example: { action: "reject_lower", coordinationNote: "Water works must finish first" },
      }),
      responses: {
        200: { description: "Resolved.", ...json(ref("Conflict")) },
        400: res$("Validation"),
        404: { description: "Conflict not found, or one/both referenced projects no longer exist.", ...json(ref("PlainError")) },
        409: { description: "Refused, and nothing is written. Either the conflict has already been actioned, or the resolution would rewrite a project it may not move: one already `completed` or `rejected`, or one in `rescheduled` — that status means another conflict has deferred it and is still awaiting its officer's answer, so rewriting it here would strand that conflict while the project proceeded on the dates that caused it. Retry once the officer has responded. Each guard is scoped to the project the chosen action actually writes: `approve_both` checks both sides, `reject_lower` only the deferred (lower-scoring) one, so a finished winner does not block it.", ...json(ref("PlainError")) },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/conflicts/{id}/respond": {
    put: {
      tags: ["Conflicts"], summary: "Officer responds to a deferral (officer)",
      description: "Applies to the project recorded in `rescheduledProject` (falling back to a derivation for conflicts created before that field existed). A `custom` date must be on or after `suggestedDate`. Clash detection is re-run against the new date.",
      parameters: [param$("IdParam")],
      requestBody: body({
        type: "object", required: ["action"],
        properties: { action: { type: "string", enum: ["accept", "custom"] }, customDate: { type: "string", format: "date", description: "Required when action is `custom`." } },
        example: { action: "accept" },
      }),
      responses: {
        200: { description: "Recorded.", ...json({ type: "object", properties: { conflict: ref("Conflict"), recheckPassed: { type: "boolean" }, newClashes: { type: "array", items: { type: "object" } } } }) },
        400: res$("Validation"),
        404: { description: "Conflict or rescheduled project not found.", ...json(ref("PlainError")) },
        409: { description: "Conflict is not awaiting an officer response, or has no suggested date.", ...json(ref("PlainError")) },
        ...PLAIN_GUARDS,
      },
    },
  },

  "/api/complaints": {
    get: {
      tags: ["Complaints"], summary: "List / search complaints (PUBLIC — no authentication)",
      description:

        "Intentionally unauthenticated — this is the public citizen view. Every complaint matching the filters is returned regardless of caller, but the DOCUMENT IS REDACTED for an unauthenticated one: `assignedOfficer`, `assignedDepartment`, `photoUrl`, `resolutionNote`, `location.coords` and `location.address` are omitted. `location.ward` is kept. An authenticated caller of any role receives the full document.\n\n" +
        "**Capped at 200 records without `?page`/`?limit`**, the same ceiling the audit trail applies, so this public endpoint cannot be used to pull an unbounded collection in one request. `X-Total-Count` is sent on every response — paginated or not — so a truncated read is never silent: compare it against the array length. Page through for more, or use `GET /api/complaints/stats` for city-wide figures, which counts in the database rather than shipping the rows.",
      security: [],
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["submitted", "acknowledged", "in_progress", "resolved"] }, description: "Must be one of the listed values; anything else returns 400." },
        { name: "department", in: "query", schema: { type: "string" }, description: "Matches `assignedDepartment` (a Department ObjectId stored as a String)." },
        { name: "assignedOfficer", in: "query", schema: { type: "string" }, description: "User ObjectId. A malformed value returns 400." },
        { name: "issueType", in: "query", schema: { type: "string", enum: ["pothole", "streetlight", "water_leak", "garbage", "drainage", "other"] }, description: "Must be one of the listed values; anything else returns 400." },
        param$("FilterFrom"), param$("FilterTo"),
        { name: "search", in: "query", schema: { type: "string" }, description: "Case-insensitive match across cnrId, description, location.address and location.ward." },
        ...PAGED,
      ],
      responses: { 200: { description: "Complaints, newest first.", headers: PAGE_HEADERS, ...json(arrayOf("Complaint")) }, 400: res$("Validation"), 429: res$("RateLimited"), 500: res$("ServerError") },
    },
    post: {
      tags: ["Complaints"], summary: "Submit a complaint (PUBLIC — no authentication)",
      description: "`cnrId` is generated server-side and ignored if supplied. Workflow state is server-owned: a complaint always begins `submitted` and unassigned, and `status`, `assignedDepartment` and `assignedOfficer` are dropped if supplied here — they are written only by the role-gated `PATCH /:id/status` and `PATCH /:id/assign`.",
      security: [],
      requestBody: body({
        type: "object", required: ["issueType", "description", "location"],
        properties: {
          issueType: { type: "string", enum: ["pothole", "streetlight", "water_leak", "garbage", "drainage", "other"] },
          description: { type: "string" },
          location: { type: "object", required: ["coords"], properties: { address: { type: "string" }, ward: { type: "string" }, coords: { type: "object", required: ["lat", "lng"], properties: { lat: { type: "number" }, lng: { type: "number" } } } } },
          photoUrl: { type: "string" },
        },
        example: { issueType: "pothole", description: "Large pothole near the school gate", location: { address: "MG Road", ward: "Ward 12", coords: { lat: 28.67, lng: 77.45 } } },
      }),
      responses: { 201: { description: "Created.", ...json(ref("Complaint")) }, 400: res$("Validation"), 409: res$("ConflictErr"), 429: res$("RateLimited"), 500: res$("ServerError") },
    },
  },
  "/api/complaints/stats": {
    get: {
      tags: ["Complaints"], summary: "City-wide complaint figures (PUBLIC — no authentication)",
      description:
        "Aggregated counts for the public citizen dashboard, computed in the database by `analyticsService` — the same module `GET /api/dashboard/complaints` reads, so the citizen and admin views cannot report different numbers for the same thing.\n\n" +
        "This exists so the public page does not have to download every complaint to count them. It discloses strictly less than the list endpoint it replaces: every figure summarises `status`, `issueType`, `location.ward` and timestamps, all of which `GET /api/complaints` already returns in full.\n\n" +
        "`byDepartment` and `unassigned` are deliberately NOT included, and `?department` is not honoured — `assignedDepartment` is redacted for an unauthenticated caller, so a per-department count would hand it back.",
      security: [],
      parameters: [
        param$("FilterFrom"), param$("FilterTo"), param$("FilterWard"),
        { name: "status", in: "query", schema: { type: "string", enum: ["submitted", "acknowledged", "in_progress", "resolved"] } },
        param$("FilterComplaintStatus"),
      ],
      responses: {
        200: {
          description: "Aggregated, read-only.",
          ...json({
            type: "object",
            properties: {
              total: { type: "integer" },
              open: { type: "integer", description: "Any status other than resolved." },
              closed: { type: "integer", description: "status === resolved." },
              byStatus: { type: "object", additionalProperties: { type: "integer" } },
              byIssueType: { type: "object", additionalProperties: { type: "integer" } },
              byWard: { type: "array", items: { type: "object", properties: { ward: { type: "string" }, count: { type: "integer" } } } },
              monthly: { type: "array", items: { type: "object", properties: { period: { type: "string", example: "2026-02" }, count: { type: "integer" } } }, description: "Complaints filed per month, by createdAt." },
              resolvedMonthly: { type: "array", items: { type: "object", properties: { period: { type: "string", example: "2026-02" }, count: { type: "integer" } } }, description: "Complaints resolved per month. Keyed on updatedAt: Complaint has no resolvedAt, and updatedAt is the closest stored signal for when a resolved complaint was actioned." },
              averages: { type: "object", properties: { resolutionDays: { type: "number", nullable: true }, resolvedCount: { type: "integer" } } },
            },
          }),
        },
        400: res$("Validation"), 429: res$("RateLimited"), 500: res$("ServerError"),
      },
    },
  },
  "/api/complaints/{id}": {
    get: {
      tags: ["Complaints"], summary: "Get one complaint by ObjectId or CNR ID (PUBLIC)",
      description: "Accepting a `cnrId` is what lets a citizen track a report by the reference they were given. Redacted for an unauthenticated caller exactly as the list is — so tracking reveals status and ward, never the reporter's exact address, coordinates, photo or the internal assignment.",
      security: [],
      parameters: [param$("ComplaintIdParam")],
      responses: { 200: { description: "Found.", ...json(ref("Complaint")) }, 404: res$("NotFound"), 429: res$("RateLimited"), 500: res$("ServerError") },
    },
    put: {
      tags: ["Complaints"], summary: "Update a complaint (admin, officer, supervisor)",
      description:
        "Accepts the legacy `{ status, note }` body (where `note` maps to `resolutionNote`) as well as general field updates. `cnrId`, `_id` and timestamps are never read from the body.\n\n" +
        "**Assignment is a narrower privilege than the rest of this route.** Supplying `assignedDepartment` or `assignedOfficer` requires `admin` or `officer` — the same roles `PATCH /:id/assign` is gated on — so a supervisor updating status or a resolution note here is accepted, while one attempting to reassign the complaint receives **403** and nothing is written. " +
        "When the assigned officer actually changes, this route raises the same `complaint_assigned` notification `PATCH /:id/assign` does; re-submitting the same officer is silent.",
      parameters: [param$("IdParam")],
      requestBody: body({
        type: "object",
        properties: {
          issueType: { type: "string" }, description: { type: "string" }, location: { type: "object" },
          photoUrl: { type: "string" }, status: { type: "string" }, resolutionNote: { type: "string" },
          note: { type: "string", description: "Alias for resolutionNote, retained for backward compatibility." },
          assignedDepartment: { type: "string" }, assignedOfficer: { type: "string" },
        },
      }),
      responses: { 200: { description: "Updated.", ...json(ref("Complaint")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },
  "/api/complaints/{id}/status": {
    patch: {
      tags: ["Complaints"], summary: "Update complaint status (admin, officer, supervisor)",
      description: "Writes an audit entry and, when an officer is assigned, sends them a notification.",
      parameters: [param$("IdParam")],
      requestBody: body({
        type: "object", required: ["status"],
        properties: { status: { type: "string", enum: ["submitted", "acknowledged", "in_progress", "resolved"] }, note: { type: "string" }, resolutionNote: { type: "string" } },
        example: { status: "in_progress", note: "Crew dispatched" },
      }),
      responses: { 200: { description: "Updated.", ...json(ref("Complaint")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },
  "/api/complaints/{id}/assign": {
    patch: {
      tags: ["Complaints"], summary: "Assign a complaint (admin, officer)",
      description: "At least one of the two fields must be supplied. Both are validated against existing, active records. A notification is sent only when the assigned officer actually changes, so re-assigning the same officer does not produce a duplicate. Pass `null` to clear an assignment.",
      parameters: [param$("IdParam")],
      requestBody: body({
        type: "object",
        properties: { assignedDepartment: { type: "string", nullable: true }, assignedOfficer: { type: "string", nullable: true } },
        example: { assignedDepartment: "6a71...", assignedOfficer: "6a71..." },
      }),
      responses: { 200: { description: "Assigned.", ...json(ref("Complaint")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },

  "/api/notifications": {
    get: {
      tags: ["Notifications"], summary: "List my notifications (auth)",
      description:
        "Always scoped to the authenticated recipient. Capped at the 50 most recent unless pagination is used. " +
        "Two exclusions apply by default: archived notifications, and categories the recipient has muted for " +
        "in-app delivery. Both remain retrievable — archived via ?archived, muted via ?includeMuted or by " +
        "naming the category explicitly. Unknown sort fields fall back to createdAt.",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } },
        { name: "read", in: "query", schema: { type: "boolean" }, description: "Filter by read state." },
        { name: "type", in: "query", schema: { type: "string" } },
        { name: "category", in: "query", schema: { type: "string", enum: ["project", "complaint", "conflict", "system"] }, description: "Naming a category also overrides the mute exclusion." },
        { name: "priority", in: "query", schema: { type: "string", enum: ["low", "normal", "high"] } },
        { name: "archived", in: "query", schema: { type: "string", enum: ["true", "false", "all"] }, description: "Default excludes archived; 'all' returns both." },
        { name: "includeMuted", in: "query", schema: { type: "boolean" }, description: "Include categories muted for in-app delivery." },
        { name: "search", in: "query", schema: { type: "string" }, description: "Case-insensitive match on title and message." },
        { name: "sortBy", in: "query", schema: { type: "string", enum: ["createdAt", "priority", "read"] } },
        { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
      ],
      responses: { 200: { description: "Notifications, newest first. X-Total-* headers are set when paginated.", ...json(arrayOf("Notification")) }, ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/stream-ticket": {
    post: {
      tags: ["Notifications"], summary: "Issue a stream ticket (auth)",
      description:
        "Exchanges the caller's session JWT — sent normally in the Authorization header — for a " +
        "single-use ticket valid for 30 seconds. EventSource cannot set headers, so the stream is " +
        "opened with this ticket instead of a long-lived token.",
      responses: {
        200: { description: "Ticket issued.", ...json({ type: "object", properties: { ticket: { type: "string" }, expiresIn: { type: "integer", example: 30 } } }) },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/notifications/stream": {
    get: {
      tags: ["Notifications"], summary: "Live notification stream — SSE (ticket)",
      description:
        "Server-Sent Events stream scoped to the authenticated recipient. Emits `notification.created`, " +
        "`notification.read`, `notification.read_all`, `notification.archived`, `notification.unarchived`, " +
        "`notification.deleted` and `notification.preferences_updated`. Authenticated with a single-use " +
        "ticket from POST /stream-ticket — a session JWT is rejected here. Because the ticket cannot be " +
        "replayed, the client reconnects by requesting a new one; missed events are recovered by " +
        "re-reading the list over REST, not replayed by the server.",
      parameters: [
        { name: "ticket", in: "query", required: true, schema: { type: "string" }, description: "Single-use ticket from POST /api/notifications/stream-ticket. A missing, expired, replayed or malformed ticket returns 401 with `error.code` `AUTH_UNAUTHORIZED`, the same envelope as every other rejection." },
      ],
      responses: {
        200: { description: "text/event-stream of notification events.", content: { "text/event-stream": { schema: { type: "string" } } } },
        ...PLAIN_GUARDS,
      },
    },
  },
  "/api/notifications/preferences": {
    get: {
      tags: ["Notifications"], summary: "My notification preferences (auth)",
      description: "Per-channel, per-category opt-outs. Unset values read as opted in.",
      responses: { 200: { description: "Preferences.", ...json({ type: "object", properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } }) }, ...PLAIN_GUARDS },
    },
    patch: {
      tags: ["Notifications"], summary: "Update my notification preferences (auth)",
      description: "Accepts a partial patch. Unknown channels and categories are ignored; the `system` category cannot be disabled. Broadcasts `notification.preferences_updated` on the stream.",
      requestBody: body({ type: "object", properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } }),
      responses: { 200: { description: "Saved preferences.", ...json({ type: "object", properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } }) }, ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/bulk-archive": {
    patch: {
      tags: ["Notifications"], summary: "Archive several notifications (auth)",
      description: "Scoped to the authenticated recipient — ids belonging to anyone else are silently skipped. Broadcasts `notification.archived` with the ids that changed.",
      requestBody: body({ type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } }),
      responses: { 200: { description: "Ids archived.", ...json({ type: "object", properties: { ids: { type: "array", items: { type: "string" } }, updated: { type: "integer" } } }) }, 400: res$("Validation"), ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/bulk-unarchive": {
    patch: {
      tags: ["Notifications"], summary: "Restore several archived notifications (auth)",
      requestBody: body({ type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } }),
      responses: { 200: { description: "Ids restored.", ...json({ type: "object", properties: { ids: { type: "array", items: { type: "string" } }, updated: { type: "integer" } } }) }, 400: res$("Validation"), ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/bulk-delete": {
    delete: {
      tags: ["Notifications"], summary: "Permanently delete several notifications (auth)",
      description: "Hard delete, scoped to the authenticated recipient. Broadcasts `notification.deleted`.",
      requestBody: body({ type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } }),
      responses: { 200: { description: "Ids deleted.", ...json({ type: "object", properties: { ids: { type: "array", items: { type: "string" } }, deleted: { type: "integer" } } }) }, 400: res$("Validation"), ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/{id}/archive": {
    patch: {
      tags: ["Notifications"], summary: "Archive one notification (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Archived.", ...json({ type: "object", properties: { ids: { type: "array", items: { type: "string" } }, updated: { type: "integer" } } }) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/{id}/unarchive": {
    patch: {
      tags: ["Notifications"], summary: "Restore one archived notification (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Restored.", ...json({ type: "object", properties: { ids: { type: "array", items: { type: "string" } }, updated: { type: "integer" } } }) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/unread-count": {
    get: {
      tags: ["Notifications"], summary: "Count my unread notifications (auth)",
      description: "Scoped to the authenticated recipient. Backs the notification badge without transferring the list.",
      responses: { 200: { description: "Unread count.", ...json({ type: "object", properties: { count: { type: "integer", example: 3 } } }) }, ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/read-all": {
    patch: {
      tags: ["Notifications"], summary: "Mark all my notifications read (auth)",
      description: "Clears exactly the set the unread count reports — archived notifications and muted categories are left untouched, so restoring one later still shows it as unread. `updated` is the number of rows actually changed.",
      responses: { 200: { description: "Acknowledged.", ...json({ type: "object", properties: { message: { type: "string", example: "All marked as read" } } }) }, ...PLAIN_GUARDS },
    },
    put: {
      tags: ["Notifications"], summary: "Mark all my notifications read — legacy alias (auth)",
      description: "Retained for backward compatibility; identical to the PATCH form.",
      responses: { 200: { description: "Acknowledged.", ...json({ type: "object", properties: { message: { type: "string" } } }) }, ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/{id}": {
    delete: {
      tags: ["Notifications"], summary: "Permanently delete one notification (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Deleted.", ...json({ type: "object", properties: { ids: { type: "array", items: { type: "string" } }, deleted: { type: "integer" } } }) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
    get: {
      tags: ["Notifications"], summary: "Get one of my notifications (auth)",
      description: "Scoped to the authenticated recipient — another user's notification returns 404, not 403.",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found.", ...json(ref("Notification")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },
  "/api/notifications/{id}/read": {
    patch: {
      tags: ["Notifications"], summary: "Mark one notification read (auth)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Updated.", ...json(ref("Notification")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },

  "/api/audit": {
    get: {
      tags: ["Audit"], summary: "List audit events (admin)",
      description:
        "Append-only. Capped at the 200 most recent unless pagination is used. There is deliberately no create/update/delete endpoint. " +
        "Filters are applied by the server, so they narrow the whole trail rather than only the rows already returned; when pagination is used the reported total counts the filtered set.",
      parameters: [
        ...PAGED,
        { name: "action", in: "query", schema: { type: "string" }, description: "Exact match on the recorded action, e.g. `project_approved`." },
        { name: "performedBy", in: "query", schema: { type: "string" }, description: "User ObjectId. A malformed value returns 400." },
        { name: "targetType", in: "query", schema: { type: "string" }, description: "Exact match, e.g. `Project`, `Conflict` or `Complaint`." },
        { name: "isOverride", in: "query", schema: { type: "string", enum: ["true", "false"] }, description: "Restricts to entries flagged as an administrator override. Any other value returns 400." },
        param$("FilterFrom"), param$("FilterTo"),
      ],
      responses: { 200: { description: "Audit events, newest first, with performedBy populated.", headers: PAGE_HEADERS, ...json(arrayOf("AuditLog")) }, 400: res$("Validation"), ...PLAIN_GUARDS },
    },
  },
  "/api/audit/{id}": {
    get: {
      tags: ["Audit"], summary: "Get one audit event (admin)",
      parameters: [param$("IdParam")],
      responses: { 200: { description: "Found.", ...json(ref("AuditLog")) }, 400: res$("Validation"), 404: res$("NotFound"), ...PLAIN_GUARDS },
    },
  },

  ...dashboardPaths(),
}


function errEx(message) {
  return { description: message, content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeError" }, example: { success: false, message } } } }
}

function dashboardPaths() {
  const FILTERS = [param$("FilterDepartment"), param$("FilterFrom"), param$("FilterTo"), param$("FilterStatus"), param$("FilterPriority"), param$("FilterWard"), param$("FilterComplaintStatus")]
  const mk = (summary, description, dataSchema, extraParams = []) => ({
    get: {
      tags: ["Dashboard"], summary, description,
      parameters: [...FILTERS, ...extraParams],
      responses: {
        200: { description: "Aggregated, read-only.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean", example: true }, data: dataSchema } } } } },
        400: { description: "Invalid department ObjectId or unparseable from/to date.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeError" } } } },
        ...ENV_GUARDS,
      },
    },
  })
  const bucket = { type: "object", additionalProperties: { type: "integer" } }
  const monthly = { type: "array", items: { type: "object", properties: { period: { type: "string", example: "2026-02" }, count: { type: "integer" } } } }
  const byWard = { type: "array", items: { type: "object", properties: { ward: { type: "string" }, count: { type: "integer" } } } }
  const byDept = { type: "array", items: { type: "object", properties: { departmentId: { type: "string", nullable: true }, name: { type: "string" }, code: { type: "string", nullable: true }, count: { type: "integer" } } } }

  return {
    "/api/dashboard/summary": mk("Cross-domain summary (admin)", "Counts across projects, conflicts, complaints, departments, users, notifications and audit. Filters apply only to collections that carry the corresponding field.", { $ref: "#/components/schemas/DashboardSummary" }),
    "/api/dashboard/projects": mk("Project analytics (admin)", "Totals plus breakdowns by status, priority, type and department, a monthly creation series, and average progress/MCDM score.", {
      type: "object",
      properties: { total: { type: "integer" }, byStatus: bucket, byPriority: bucket, byType: bucket, byDepartment: byDept, byWard, monthly, averages: { type: "object", properties: { progress: { type: "number", nullable: true }, mcdmScore: { type: "number", nullable: true }, completionDays: { type: "number", nullable: true }, completedCount: { type: "integer" } } } },
    }),
    "/api/dashboard/conflicts": mk("Conflict analytics (admin)", "Only the date-range filter applies; Conflict carries no department or priority.", {
      type: "object",
      properties: { total: { type: "integer" }, open: { type: "integer" }, resolved: { type: "integer" }, byStatus: bucket, bySeverity: bucket, byWard, monthly, recheckPassed: { type: "integer" } },
    }),
    "/api/dashboard/complaints": mk("Complaint analytics (admin)", "Department names are resolved by converting the String `assignedDepartment` to an ObjectId; unmatched or malformed values fall into an `Unassigned` bucket.", {
      type: "object",
      properties: { total: { type: "integer" }, open: { type: "integer" }, closed: { type: "integer" }, unassigned: { type: "integer" }, byStatus: bucket, byIssueType: bucket, byDepartment: byDept, byWard, monthly, averages: { type: "object", properties: { resolutionDays: { type: "number", nullable: true }, resolvedCount: { type: "integer" } } } },
    }),
    "/api/dashboard/departments": mk("Per-department rollup (admin)", "Project and complaint counts per department.", {
      type: "object",
      properties: { total: { type: "integer" }, active: { type: "integer" }, departments: { type: "array", items: { type: "object", properties: { _id: { type: "string" }, name: { type: "string" }, code: { type: "string" }, isActive: { type: "boolean" }, projects: { type: "integer" }, completed: { type: "integer" }, avgProgress: { type: "number", nullable: true }, complaints: { type: "integer" } } } } },
    }),
    "/api/dashboard/activity": mk("Audit activity analytics (admin)", "Only the date-range filter applies. `limit` caps the `recent` list at 100.", {
      type: "object",
      properties: { total: { type: "integer" }, overrides: { type: "integer" }, byAction: bucket, byTargetType: bucket, monthly, recent: { type: "array", items: { $ref: "#/components/schemas/AuditLog" } } },
    }, [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }, description: "Size of the `recent` list (max 100). Distinct from list pagination." }]),
  }
}
