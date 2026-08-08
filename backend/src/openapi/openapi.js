// OpenAPI 3.0.3 specification; the implementation is the source of truth.
// Errors are uniform, success payloads deliberately are not — both families are
// documented as-is, because converging them would break existing consumers.

const ROLES = ["admin", "officer", "supervisor"]

const ERROR_CODE_VALUES = [
  "AUTH_UNAUTHORIZED", "AUTH_FORBIDDEN", "AUTH_TOKEN_EXPIRED",
  "AUTH_INVALID_CREDENTIALS", "AUTH_ACCOUNT_DEACTIVATED",
  "VALIDATION_ERROR", "INVALID_ID", "CONFLICT", "DUPLICATE_RESOURCE",
  "NOT_FOUND", "PROJECT_NOT_FOUND", "COMPLAINT_NOT_FOUND", "CONFLICT_NOT_FOUND",
  "DEPARTMENT_NOT_FOUND", "USER_NOT_FOUND", "NOTIFICATION_NOT_FOUND",
  "AUDIT_LOG_NOT_FOUND", "ROUTE_NOT_FOUND", "RATE_LIMITED", "INTERNAL_ERROR",
]

// One shape, described twice only so existing $refs keep resolving.
const ApiErrorBody = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    error: {
      type: "object",
      properties: {
        code: { type: "string", enum: ERROR_CODE_VALUES },
        message: { type: "string" },
        details: { description: "Validation detail. Omitted in production." },
      },
      required: ["code", "message"],
    },
    message: { type: "string", description: "Mirrors error.message; kept for backward compatibility." },
  },
}
const EnvelopeError = ApiErrorBody
const PlainError = ApiErrorBody

const errRef = (schema, description, example) => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` }, ...(example ? { example } : {}) } },
})

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "CIVIQ Backend API",
    version: "1.0.0",
    description:
      "Municipal infrastructure coordination API.\n\n" +
      "**Authentication** — JWT Bearer tokens. Obtain one from `POST /api/auth/login` " +
      "and send it as `Authorization: Bearer <token>`.\n\n" +
      "**Response shapes are not uniform.** `auth`, `departments`, `users` and " +
      "`dashboard` return a `{ success, ... }` envelope. `projects`, `conflicts`, " +
      "`complaints`, `notifications` and `audit` return the raw document or array, " +
      "with errors as `{ message }`. Each operation below documents its actual shape.\n\n" +
      "**Pagination is opt-in.** List endpoints accept `page` and `limit`. When " +
      "neither is supplied the endpoint behaves exactly as before (unpaginated). " +
      "When supplied, the response **body is unchanged** and totals are returned in " +
      "`X-Total-Count`, `X-Page`, `X-Limit` and `X-Total-Pages` headers.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "Health", description: "Infrastructure health probe" },
    { name: "Auth", description: "Registration, login, logout, current user" },
    { name: "Config", description: "Read-only lookup configuration. Served from static configuration, not a collection — there is no create, update or delete." },
    { name: "Departments", description: "Department management. Reads are open to any authenticated role, because departments are referenced by id elsewhere; writes are admin only." },
    { name: "Users", description: "User management (admin only)" },
    { name: "Projects", description: "Project lifecycle, MCDM scoring and clash detection" },
    { name: "Conflicts", description: "Clash records and their resolution workflow" },
    { name: "Complaints", description: "Public complaint reporting and resolution workflow" },
    { name: "Notifications", description: "Per-recipient notifications" },
    { name: "Audit", description: "Append-only audit trail (admin only)" },
    { name: "Dashboard", description: "Read-only aggregated analytics (admin only)" },
  ],

  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },

    parameters: {
      IdParam: {
        name: "id", in: "path", required: true,
        schema: { type: "string" },
        description: "MongoDB ObjectId. An unparseable value returns 400.",
      },
      ComplaintIdParam: {
        name: "id", in: "path", required: true,
        schema: { type: "string" },
        description: "Either a MongoDB ObjectId or a CNR ID (e.g. `CNR-100001`).",
      },
      PageParam: {
        name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 },
        description: "Opt-in pagination. Omit both `page` and `limit` for the original unpaginated behaviour.",
      },
      LimitParam: {
        name: "limit", in: "query", required: false,
        schema: { type: "integer", minimum: 1, maximum: 200, default: 25 },
        description: "Page size. Defaults to 25 and is capped at 200.",
      },
      FilterDepartment: { name: "department", in: "query", schema: { type: "string" }, description: "Department ObjectId." },
      FilterFrom: { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "Inclusive lower bound on createdAt." },
      FilterTo: { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Inclusive upper bound on createdAt." },
      FilterStatus: { name: "status", in: "query", schema: { type: "string" } },
      FilterPriority: { name: "priority", in: "query", schema: { type: "string", enum: ["Low", "Medium", "High", "Critical"] } },
      FilterWard: { name: "ward", in: "query", schema: { type: "string" }, description: "Exact `location.ward` value. Applies to projects and complaints, and to conflicts via their first project." },
      FilterComplaintStatus: { name: "complaintStatus", in: "query", schema: { type: "string" }, description: "Complaint status. Separate from `status` because project and complaint status enums are disjoint." },
    },

    headers: {
      XTotalCount: { schema: { type: "integer" }, description: "Total matching documents. Only sent when pagination is used." },
      XPage: { schema: { type: "integer" }, description: "Current page. Only sent when pagination is used." },
      XLimit: { schema: { type: "integer" }, description: "Page size. Only sent when pagination is used." },
      XTotalPages: { schema: { type: "integer" }, description: "Total pages. Only sent when pagination is used." },
      XHasNext: { schema: { type: "boolean" }, description: "Whether a further page exists. Only sent when pagination is used." },
      XHasPrevious: { schema: { type: "boolean" }, description: "Whether an earlier page exists. Only sent when pagination is used." },
    },

    schemas: {
      EnvelopeError,
      PlainError,

      User: {
        type: "object",
        description: "`password` is never returned (schema `select:false` plus a `toJSON` transform that also strips `__v`).",
        properties: {
          _id: { type: "string" },
          fullName: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ROLES },
          department: { type: "string", nullable: true, description: "Stores a Department ObjectId as a String (schema type is String, not a ref)." },
          phone: { type: "string", nullable: true },
          avatar: { type: "string", nullable: true },
          isActive: { type: "boolean", default: true },
          lastLogin: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      Department: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          code: { type: "string", description: "Stored uppercase." },
          description: { type: "string", nullable: true },
          color: { type: "string", default: "#000000" },
          isActive: { type: "boolean", default: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      ProjectLocation: {
        type: "object",
        properties: {
          roadName: { type: "string" }, neighbourhood: { type: "string" },
          ward: { type: "string" }, zone: { type: "string" },
          city: { type: "string", default: "Ghaziabad" },
          state: { type: "string", default: "Uttar Pradesh" },
          address: { type: "string" },
          centerCoords: {
            type: "object", required: ["lat", "lng"],
            properties: { lat: { type: "number" }, lng: { type: "number" } },
          },
          shape: { type: "string", enum: ["corridor", "circle", "rectangle", "polygon"] },
          length: { type: "number" }, width: { type: "number" },
          area: { type: "number" }, buffer: { type: "number" },
          geoJSON: { type: "object", description: "Free-form stored geometry. Client-writable — `location` is whitelisted as a whole — and returned as supplied; the server never derives or modifies it. The frontend GIS utility layer renders it as the project's real shape, falling back to a Point at `centerCoords` when absent." },
        },
      },

      McdmInputs: {
        type: "object",
        properties: {
          conditionRating: { type: "string" },
          incidents: { type: "array", items: { type: "string" } },
          lastWorkYear: { type: "integer" },
          tenderStatus: { type: "string" },
          contractorAssigned: { type: "boolean" },
          roadClosure: { type: "string" },
          utilityDisruption: { type: "array", items: { type: "string" } },
          disruptionDays: { type: "integer" },
        },
      },

      Project: {
        type: "object",
        properties: {
          _id: { type: "string" },
          title: { type: "string" },
          projectId: { type: "string", description: "Auto-generated, e.g. `PRJ-0001`. Server-owned." },
          department: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Department" }], description: "Department ObjectId; populated to `{_id,name,code}` on reads." },
          projectType: { type: "string", enum: ["road", "water", "sewage", "electricity", "parks", "other"] },
          description: { type: "string" },
          phase: { type: "string", enum: ["standalone", "phase1", "continuation"], default: "standalone" },
          parentProject: { type: "string", nullable: true },
          phaseNumber: { type: "integer", default: 1 },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          actualEndDate: { type: "string", format: "date-time", nullable: true },
          estimatedCost: { type: "number" }, budgetSource: { type: "string" },
          tenderNumber: { type: "string" }, contractorName: { type: "string" }, contractorFirm: { type: "string" },
          location: { $ref: "#/components/schemas/ProjectLocation" },
          mcdmScore: { type: "number", description: "Computed by mcdmEngine on create. 0–10 scale." },
          mcdmBreakdown: {
            type: "object",
            description:
              "Per-criterion scores on a 1–10 scale, keyed by criterion name. " +
              "`populationImpact` and `economicValue` are **not measured**: this deployment holds no ward population register and no benefit valuation, and neither is collected from the officer, so the engine assigns both the neutral mid-scale value (5) for every project. " +
              "They therefore separate no two projects and change no ranking, despite carrying 21% and 3% of the weight. The remaining five criteria are computed from stored project data.",
          },
          mcdmInputs: { $ref: "#/components/schemas/McdmInputs" },
          status: { type: "string", enum: ["pending", "approved", "rejected", "active", "completed", "rescheduled"], default: "pending" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
          officer: { type: "string" }, supervisor: { type: "string", nullable: true },
          projectManager: { type: "string", nullable: true },
          createdBy: { type: "string", description: "Set from the authenticated user. Never accepted from the request body." },
          adminNote: { type: "string" }, rejectionReason: { type: "string" },
          suggestedDate: { type: "string", format: "date-time", nullable: true },
          progress: { type: "number", default: 0 },
          documents: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, type: { type: "string" } } } },
          hasClash: { type: "boolean", default: false, description: "Derived: `clashes` is non-empty. Server-owned." },
          clashes: { type: "array", items: { type: "string" }, description: "Conflict ids referencing this project, from either side of the pair — a collision the OTHER project's save detected is recorded here too. Server-owned; a denormalisation of the Conflict collection, which stays authoritative." },
          isActive: { type: "boolean", default: true, description: "Soft-delete flag. Distinct from `status: \"active\"`. A project with `isActive: false` is excluded from list and single-project reads; only `PATCH /api/projects/{id}/status` can restore it." },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      PublicProject: {
        type: "object",
        description: "The transparency portal's view of a project — whitelisted by serialisePublicProject, not redacted from Project. No officer, supervisor, MCDM, clash or admin field exists on this shape at all.",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          department: { type: "object", nullable: true, properties: { code: { type: "string" }, name: { type: "string" } } },
          projectType: { type: "string", enum: ["road", "water", "sewage", "electricity", "parks", "other"] },
          status: { type: "string", enum: ["approved", "active", "completed", "rescheduled"], description: "Only these four values are ever public — pending and rejected projects are excluded by the query." },
          progress: { type: "number" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          actualEndDate: { type: "string", format: "date-time", nullable: true },
          location: {
            type: "object",
            properties: {
              ward: { type: "string", nullable: true }, zone: { type: "string", nullable: true },
              address: { type: "string", nullable: true }, city: { type: "string", nullable: true },
              state: { type: "string", nullable: true },
              centerCoords: { type: "object", nullable: true, properties: { lat: { type: "number" }, lng: { type: "number" } } },
            },
          },
        },
      },

      Conflict: {
        type: "object",
        properties: {
          _id: { type: "string" },
          project1: { type: "string" }, project2: { type: "string" },
          clashTypes: { type: "array", items: { type: "string", enum: ["geographic", "timeline", "worktype"] } },
          severity: { type: "string", enum: ["incompatible", "conditional"], default: "incompatible" },
          status: { type: "string", enum: ["pending", "resolved_both", "resolved_rejected", "awaiting_officer"], default: "pending" },
          adminResolution: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["approve_both", "reject_lower"] },
              coordinationNote: { type: "string" }, overrideCategory: { type: "string" },
              overrideReason: { type: "string" }, overrideRef: { type: "string" },
              resolvedBy: { type: "string" }, resolvedAt: { type: "string", format: "date-time" },
            },
          },
          officerResponse: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["accept", "custom"] },
              customDate: { type: "string", format: "date-time" },
              respondedBy: { type: "string" }, respondedAt: { type: "string", format: "date-time" },
            },
          },
          suggestedDate: { type: "string", format: "date-time", nullable: true },
          recheckPassed: { type: "boolean", nullable: true },
          rescheduledProject: { type: "string", nullable: true, description: "Which of project1/project2 was deferred by `reject_lower`." },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      Complaint: {
        type: "object",
        properties: {
          _id: { type: "string" },
          cnrId: { type: "string", description: "Auto-generated, e.g. `CNR-100001`. Server-owned; ignored if supplied." },
          issueType: { type: "string", enum: ["pothole", "streetlight", "water_leak", "garbage", "drainage", "other"] },
          description: { type: "string" },
          location: {
            type: "object",
            properties: {
              address: { type: "string" }, ward: { type: "string" },
              coords: { type: "object", required: ["lat", "lng"], properties: { lat: { type: "number" }, lng: { type: "number" } } },
            },
          },
          photoUrl: { type: "string", nullable: true },
          status: { type: "string", enum: ["submitted", "acknowledged", "in_progress", "resolved"], default: "submitted" },
          assignedDepartment: { type: "string", nullable: true, description: "Stores a Department ObjectId as a String (schema type is String, not a ref)." },
          assignedOfficer: { type: "string", nullable: true },
          resolutionNote: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      NotificationPreferences: {
        type: "object",
        description:
          "Per-channel opt-outs keyed by category. Absent values read as opted in. " +
          "`system` is mandatory and always returns true.",
        properties: {
          inApp: {
            type: "object",
            properties: {
              project: { type: "boolean" }, complaint: { type: "boolean" },
              conflict: { type: "boolean" }, system: { type: "boolean", readOnly: true },
            },
          },
          email: {
            type: "object",
            properties: {
              project: { type: "boolean" }, complaint: { type: "boolean" },
              conflict: { type: "boolean" }, system: { type: "boolean", readOnly: true },
            },
          },
        },
      },

      Notification: {
        type: "object",
        properties: {
          _id: { type: "string" },
          recipient: { type: "string" },
          type: {
            type: "string",
            enum: [
              "clash_detected", "project_approved", "project_rejected",
              "project_assigned", "project_completed", "early_completion",
              "complaint_assigned", "complaint_status_changed", "role_changed",
            ],
          },
          title: { type: "string" }, message: { type: "string" },
          link: { type: "string", nullable: true, description: "Client path, built for the RECIPIENT's role — the same project is `/admin/projects/{id}`, `/officer/projects/{id}` or `/supervisor/tasks/{id}` depending on who receives it. Null when that role has no screen for the destination." },
          read: { type: "boolean", default: false },
          readAt: { type: "string", format: "date-time", nullable: true, description: "Set when read flips to true." },
          archived: { type: "boolean", default: false, description: "Soft-deleted: kept in history, hidden from the default feed." },
          archivedAt: { type: "string", format: "date-time", nullable: true },
          category: { type: "string", enum: ["project", "complaint", "conflict", "system"], description: "Derived from type." },
          priority: { type: "string", enum: ["low", "normal", "high"], description: "Derived from type." },
          data: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      AuditLog: {
        type: "object",
        properties: {
          _id: { type: "string" },
          action: { type: "string", description: "Emitted values: project_created, project_updated, project_approved, project_rejected, progress_updated, project_status_updated, conflict_resolved, conflict_responded, complaint_created, complaint_updated, complaint_status_updated, complaint_assigned, profile_updated, password_changed, user_updated, user_status_updated, department_created, department_updated, department_status_updated." },
          performedBy: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }], nullable: true, description: "Null for unauthenticated public complaint submissions." },
          targetType: { type: "string" }, targetId: { type: "string" },
          details: { type: "object", nullable: true },
          isOverride: { type: "boolean", default: false },
          ipAddress: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      DashboardSummary: {
        type: "object",
        properties: {
          projects: {
            type: "object",
            properties: {
              total: { type: "integer" },
              active: { type: "integer", description: "Count of status === \"active\" (workflow), NOT the soft-delete flag." },
              completed: { type: "integer" },
              delayed: { type: "integer", description: "Derived at query time: endDate < now AND status not in [completed, rejected]. Never persisted." },
              softDeleted: { type: "integer", description: "Count of isActive === false." },
              byStatus: { type: "object", additionalProperties: { type: "integer" } },
              byPriority: { type: "object", additionalProperties: { type: "integer" } },
            },
          },
          conflicts: {
            type: "object",
            properties: {
              total: { type: "integer" },
              open: { type: "integer", description: "status in [pending, awaiting_officer]." },
              resolved: { type: "integer", description: "status in [resolved_both, resolved_rejected]." },
              byStatus: { type: "object", additionalProperties: { type: "integer" } },
              bySeverity: { type: "object", additionalProperties: { type: "integer" } },
            },
          },
          complaints: {
            type: "object",
            properties: {
              total: { type: "integer" },
              open: { type: "integer", description: "Any status other than resolved." },
              closed: { type: "integer", description: "status === resolved." },
              byStatus: { type: "object", additionalProperties: { type: "integer" } },
            },
          },
          departments: { type: "object", properties: { total: { type: "integer" }, active: { type: "integer" } } },
          users: {
            type: "object",
            properties: { total: { type: "integer" }, active: { type: "integer" }, byRole: { type: "object", additionalProperties: { type: "integer" } } },
          },
          notifications: {
            type: "object",
            properties: {
              total: { type: "integer" }, read: { type: "integer" },
              unread: { type: "integer", description: "Derived as total - read at query time." },
              byType: { type: "object", additionalProperties: { type: "integer" } },
            },
          },
          audit: { type: "object", properties: { total: { type: "integer" }, overrides: { type: "integer" } } },
        },
      },
    },

    responses: {
      // Enveloped modules: auth, departments, users, dashboard
      EnvUnauthorized: errRef("EnvelopeError", "Missing, invalid or expired token.", { success: false, message: "Not authorized — no token provided" }),
      EnvForbidden: errRef("EnvelopeError", "Authenticated but the role is not permitted.", { success: false, message: "Not authorized for this role" }),
      EnvNotFound: errRef("EnvelopeError", "Resource not found."),
      EnvValidation: errRef("EnvelopeError", "Validation failed."),
      EnvConflict: errRef("EnvelopeError", "Duplicate / state conflict."),
      EnvServerError: errRef("EnvelopeError", "Unexpected server error."),
      // Plain modules. 401/403 stay enveloped: they come from shared middleware.
      Unauthorized: errRef("EnvelopeError", "Missing, invalid or expired token. Emitted by the shared auth middleware, which uses the enveloped shape on every route.", { success: false, message: "Not authorized — no token provided" }),
      Forbidden: errRef("EnvelopeError", "Authenticated but the role is not permitted. Emitted by the shared auth middleware.", { success: false, message: "Not authorized for this role" }),
      NotFound: errRef("PlainError", "Resource not found."),
      Validation: errRef("PlainError", "Validation failed."),
      ConflictErr: errRef("PlainError", "Duplicate / state conflict."),
      ServerError: errRef("PlainError", "Unexpected server error."),
      EnvRateLimited: errRef("EnvelopeError", "Rate limit exceeded. Emitted by the shared limiter, which uses the enveloped shape on every route.", { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, please try again later." }, message: "Too many requests, please try again later." }),
      RateLimited: errRef("EnvelopeError", "Rate limit exceeded. Emitted by the shared limiter, which uses the enveloped shape on every route.", { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, please try again later." }, message: "Too many requests, please try again later." }),
      RouteNotFound: {
        description: "No route matched.",
        content: {
          "application/json": {
            schema: { type: "object", properties: { success: { type: "boolean" }, status: { type: "string" }, message: { type: "string" } } },
            example: { success: false, status: "error", message: "Route not found: GET /api/nope" },
          },
        },
      },
    },
  },

  // Everything requires a Bearer token unless an operation sets `security: []`.
  security: [{ bearerAuth: [] }],

  paths: require("./paths"),
}
