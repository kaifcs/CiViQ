// Centralised API layer for backend resources.
// Adapters convert responses into frontend view models.

import apiClient, { normaliseError, readPagination, TOKEN_KEY, USER_KEY } from "./apiClient"
import {
  adaptUser, adaptProject, adaptConflict, adaptComplaint,
  adaptAuditLog, adaptNotification, adaptDepartment, departmentIndex,
  adaptPublicProject, PROJECT_TYPE_VALUE, ROLES, roleLabel, ISSUE_TYPE_OPTIONS,
  PUBLIC_PROJECT_STATUSES,
} from "./adapters"

export { normaliseError, readPagination, TOKEN_KEY, USER_KEY, PROJECT_TYPE_VALUE }
export { ROLES, roleLabel, ISSUE_TYPE_OPTIONS, PUBLIC_PROJECT_STATUSES }
// Pure form -> backend projection.
export { buildProjectPayload } from "./adapters"
export { openNotificationStream } from "./notificationStream"

export const authApi = {
  async login(email, password) {
    const { data } = await apiClient.post("/auth/login", { email, password })
    return { token: data.token, user: data.user }
  },

  async register(payload) {
    const { data } = await apiClient.post("/auth/register", payload)
    return data.user
  },

  async me() {
    const { data } = await apiClient.get("/auth/me")
    return data.user
  },

  async logout() {
    try { await apiClient.post("/auth/logout") } catch { /* stateless: ignore */ }
  },

  // Self-service profile update; separate from admin user updates.
  async updateProfile(payload) {
    const { data } = await apiClient.put("/auth/profile", payload)
    return data.user
  },

  async changePassword(payload) {
    const { data } = await apiClient.put("/auth/password", payload)
    return data
  },
}

// Complaint queue shared across staff roles.
export const configApi = {
  async wards() {
    const { data } = await apiClient.get("/config/wards")
    return data.wards || []
  },
}

export const departmentsApi = {
  async list() {
    const { data } = await apiClient.get("/departments")
    return (data.departments || []).map(adaptDepartment)
  },

  // Raw records for the department index.
  async listRaw() {
    const { data } = await apiClient.get("/departments")
    return data.departments || []
  },

  async get(id) {
    const { data } = await apiClient.get(`/departments/${id}`)
    return adaptDepartment(data.department)
  },

  async create(payload) {
    const { data } = await apiClient.post("/departments", payload)
    return adaptDepartment(data.department)
  },

  async update(id, payload) {
    const { data } = await apiClient.put(`/departments/${id}`, payload)
    return adaptDepartment(data.department)
  },

  async setStatus(id, isActive) {
    const { data } = await apiClient.patch(`/departments/${id}/status`, { isActive })
    return adaptDepartment(data.department)
  },
}

export const usersApi = {
  async list(deptMap) {
    const { data } = await apiClient.get("/users")
    return (data.users || []).map((u) => adaptUser(u, deptMap))
  },

  async get(id, deptMap) {
    const { data } = await apiClient.get(`/users/${id}`)
    return adaptUser(data.user, deptMap)
  },

  async update(id, payload, deptMap) {
    const { data } = await apiClient.put(`/users/${id}`, payload)
    return adaptUser(data.user, deptMap)
  },

  async setStatus(id, isActive, deptMap) {
    const { data } = await apiClient.patch(`/users/${id}/status`, { isActive })
    return adaptUser(data.user, deptMap)
  },
}

export const projectsApi = {
  // Optional pagination parameters.
  async list(deptMap, params) {
    const { data } = await apiClient.get("/projects", { params })
    return (data || []).map((p) => adaptProject(p, deptMap))
  },

  async get(id, deptMap) {
    const { data } = await apiClient.get(`/projects/${id}`)
    return adaptProject(data, deptMap)
  },

  // Payload must already be in backend shape.
  async create(payload, deptMap) {
    const { data } = await apiClient.post("/projects", payload)
    return { project: adaptProject(data.project, deptMap), mcdm: data.mcdm, clashesDetected: data.clashesDetected }
  },

  async update(id, payload, deptMap) {
    const { data } = await apiClient.put(`/projects/${id}`, payload)
    return adaptProject(data, deptMap)
  },

  async approve(id, note, deptMap) {
    const { data } = await apiClient.put(`/projects/${id}/approve`, { note })
    return adaptProject(data, deptMap)
  },

  async reject(id, reason, suggestedDate, deptMap) {
    const { data } = await apiClient.put(`/projects/${id}/reject`, { reason, suggestedDate })
    return adaptProject(data, deptMap)
  },

  async updateProgress(id, progress, deptMap) {
    const { data } = await apiClient.put(`/projects/${id}/progress`, { progress })
    return adaptProject(data, deptMap)
  },

  async setStatus(id, isActive, deptMap) {
    const { data } = await apiClient.patch(`/projects/${id}/status`, { isActive })
    return adaptProject(data, deptMap)
  },
}

// Public project data requires no authentication.
export const publicProjectsApi = {
  // Paged shape rather than a bare array: the backend caps an unpaginated read,
  // so the caller needs the total to tell a complete list from a truncated one.
  async listPaged(params) {
    const response = await apiClient.get("/projects/public", { params })
    return {
      items: (response.data || []).map(adaptPublicProject),
      pagination: readPagination(response),
    }
  },

  async get(id) {
    const { data } = await apiClient.get(`/projects/public/${id}`)
    return adaptPublicProject(data)
  },
}

export const conflictsApi = {
  // Optional pagination parameters.
  async list(deptMap, params) {
    const { data } = await apiClient.get("/conflicts", { params })
    return (data || []).map((c) => adaptConflict(c, deptMap))
  },

  async get(id, deptMap) {
    const { data } = await apiClient.get(`/conflicts/${id}`)
    return adaptConflict(data, deptMap)
  },

  async resolve(id, payload, deptMap) {
    const { data } = await apiClient.put(`/conflicts/${id}/resolve`, payload)
    return adaptConflict(data, deptMap)
  },

  async respond(id, action, customDate) {
    const { data } = await apiClient.put(`/conflicts/${id}/respond`, { action, customDate })
    return { conflict: adaptConflict(data.conflict), recheckPassed: data.recheckPassed, newClashes: data.newClashes }
  },
}

export const complaintsApi = {
  async list(params, deptMap) {
    const { data } = await apiClient.get("/complaints", { params })
    return (data || []).map((c) => adaptComplaint(c, deptMap))
  },

  // Server-paged complaint list with pagination metadata.
  async listPaged(params, deptMap) {
    const response = await apiClient.get("/complaints", { params })
    return {
      items: (response.data || []).map((c) => adaptComplaint(c, deptMap)),
      pagination: readPagination(response),
    }
  },

  // Server-side complaint statistics.
  async stats(params) {
    const { data } = await apiClient.get("/complaints/stats", { params })
    return data
  },

  async get(idOrCnr, deptMap) {
    const { data } = await apiClient.get(`/complaints/${idOrCnr}`)
    return adaptComplaint(data, deptMap)
  },

  async create(payload, deptMap) {
    const { data } = await apiClient.post("/complaints", payload)
    return adaptComplaint(data, deptMap)
  },

  async update(id, payload, deptMap) {
    const { data } = await apiClient.put(`/complaints/${id}`, payload)
    return adaptComplaint(data, deptMap)
  },

  async setStatus(id, status, note, deptMap) {
    const { data } = await apiClient.patch(`/complaints/${id}/status`, { status, note })
    return adaptComplaint(data, deptMap)
  },

  async assign(id, { assignedDepartment, assignedOfficer }, deptMap) {
    const { data } = await apiClient.patch(`/complaints/${id}/assign`, { assignedDepartment, assignedOfficer })
    return adaptComplaint(data, deptMap)
  },
}

export const notificationsApi = {
  async list(params) {
    const { data } = await apiClient.get("/notifications", { params })
    return (data || []).map(adaptNotification)
  },

  // Notification stream uses a short-lived ticket.
  async streamTicket() {
    const { data } = await apiClient.post("/notifications/stream-ticket")
    return data?.ticket || null
  },

  // Exact unread count, independent of the list cap.
  async unreadCount() {
    const { data } = await apiClient.get("/notifications/unread-count")
    return data?.count ?? 0
  },

  async get(id) {
    const { data } = await apiClient.get(`/notifications/${id}`)
    return adaptNotification(data)
  },

  async markRead(id) {
    const { data } = await apiClient.patch(`/notifications/${id}/read`)
    return adaptNotification(data)
  },

  async markAllRead() {
    const { data } = await apiClient.patch("/notifications/read-all")
    return data
  },

  async archive(ids) {
    const { data } = await apiClient.patch("/notifications/bulk-archive", { ids })
    return data
  },

  async unarchive(ids) {
    const { data } = await apiClient.patch("/notifications/bulk-unarchive", { ids })
    return data
  },

  async remove(ids) {
    const { data } = await apiClient.delete("/notifications/bulk-delete", { data: { ids } })
    return data
  },

  async getPreferences() {
    const { data } = await apiClient.get("/notifications/preferences")
    return data?.preferences || null
  },

  async updatePreferences(preferences) {
    const { data } = await apiClient.patch("/notifications/preferences", { preferences })
    return data?.preferences || null
  },
}

export const auditApi = {
  async list(deptMap, params = {}) {
    const { data } = await apiClient.get("/audit", { params })
    return (data || []).map((a) => adaptAuditLog(a, deptMap))
  },

  async get(id, deptMap) {
    const { data } = await apiClient.get(`/audit/${id}`)
    return adaptAuditLog(data, deptMap)
  },
}

export const dashboardApi = {
  async summary(params) {
    const { data } = await apiClient.get("/dashboard/summary", { params })
    return data.data
  },

  async projects(params) {
    const { data } = await apiClient.get("/dashboard/projects", { params })
    return data.data
  },

  async conflicts(params) {
    const { data } = await apiClient.get("/dashboard/conflicts", { params })
    return data.data
  },

  async complaints(params) {
    const { data } = await apiClient.get("/dashboard/complaints", { params })
    return data.data
  },

  async departments(params) {
    const { data } = await apiClient.get("/dashboard/departments", { params })
    return data.data
  },

  async activity(params) {
    const { data } = await apiClient.get("/dashboard/activity", { params })
    return data.data
  },
}

export { departmentIndex }