// Per-resource data hooks. Each returns adapted view models and takes the
// department index from AuthContext so adapters can resolve department refs.

import { useCallback, useMemo } from "react"
import { useApi } from "./useApi"
import { useAuth } from "./useAuth"
import { useNotificationCenter } from "./useNotificationCenter"
import {
  projectsApi, conflictsApi, complaintsApi, usersApi,
  auditApi, dashboardApi, departmentsApi,
} from "../services"

export function useProjects(params) {
  const { deptMap } = useAuth()
  return useApi(
    useCallback(() => projectsApi.list(deptMap, params), [deptMap, params]),
    [deptMap, params],
    { initialData: [] }
  )
}

export function useProject(id) {
  const { deptMap } = useAuth()
  return useApi(useCallback(() => projectsApi.get(id, deptMap), [id, deptMap]), [id, deptMap], { skip: !id })
}

export function useConflicts(params) {
  const { deptMap } = useAuth()
  return useApi(
    useCallback(() => conflictsApi.list(deptMap, params), [deptMap, params]),
    [deptMap, params],
    { initialData: [] }
  )
}

export function useConflict(id) {
  const { deptMap } = useAuth()
  return useApi(useCallback(() => conflictsApi.get(id, deptMap), [id, deptMap]), [id, deptMap], { skip: !id })
}

export function useComplaints(params) {
  const { deptMap } = useAuth()
  return useApi(
    useCallback(() => complaintsApi.list(params, deptMap), [params, deptMap]),
    [params, deptMap],
    { initialData: [] }
  )
}

export function useComplaint(id) {
  const { deptMap } = useAuth()
  return useApi(useCallback(() => complaintsApi.get(id, deptMap), [id, deptMap]), [id, deptMap], { skip: !id })
}

// City-wide complaint figures from GET /api/complaints/stats. Counted in the
// database rather than derived from useComplaints(), whose list is capped at 200
// records server-side and would report that cap as the city total.
export function useComplaintStats(params) {
  return useApi(useCallback(() => complaintsApi.stats(params), [params]), [params])
}

// The complaints a citizen is tracking. Reports are anonymous, so there is no
// "my complaints" endpoint — each device-local CNR is fetched on its own, and
// one that no longer resolves is dropped rather than failing the whole list.
export function useTrackedComplaints(cnrs) {
  const { deptMap } = useAuth()
  return useApi(
    useCallback(async () => {
      const found = await Promise.all(
        (cnrs || []).map((cnr) => complaintsApi.get(cnr, deptMap).catch(() => null))
      )
      return found.filter(Boolean)
    }, [cnrs, deptMap]),
    [cnrs, deptMap],
    { initialData: [] }
  )
}

export function useUsers() {
  const { deptMap } = useAuth()
  return useApi(useCallback(() => usersApi.list(deptMap), [deptMap]), [deptMap], { initialData: [] })
}

export function useUser(id) {
  const { deptMap } = useAuth()
  return useApi(useCallback(() => usersApi.get(id, deptMap), [id, deptMap]), [id, deptMap], { skip: !id })
}

export function useAuditLogs(params) {
  const { deptMap } = useAuth()
  return useApi(useCallback(() => auditApi.list(deptMap, params), [deptMap, params]), [deptMap, params], { initialData: [] })
}

// Derive assignable supervisors from accessible projects.
// Officers cannot call the admin-only /api/users endpoint.
export function useAssignableSupervisors() {
  const { data: projects, loading, error, reload } = useProjects()

  const supervisors = useMemo(() => {
    const byId = new Map()
    for (const project of projects || []) {
      if (!project.supervisorId || byId.has(project.supervisorId)) continue
      byId.set(project.supervisorId, {
        id: project.supervisorId,
        name: project.supervisorName || 'Unnamed supervisor',
      })
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  return { supervisors, loading, error, reload }
}

// Build department filter options from AuthContext.
export function useDepartmentOptions() {
  const { deptMap } = useAuth()
  return useMemo(
    () =>
      [...(deptMap?.values() || [])]
        .filter((d) => d?.code)
        .map((d) => ({ value: d.code, label: d.name || d.code }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [deptMap]
  )
}

// Reuse the shared notification state to avoid duplicate requests.
export function useNotifications() {
  const { data, loading, error, reload } = useNotificationCenter()
  return { data, loading, error, reload }
}

export function useDepartments() {
  return useApi(useCallback(() => departmentsApi.list(), []), [], { initialData: [] })
}

export function useDashboardSummary(params) {
  return useApi(
    useCallback(() => dashboardApi.summary(params), [params]),
    [params]
  )
}

export function useDashboardProjects(params) {
  return useApi(useCallback(() => dashboardApi.projects(params), [params]), [params])
}

export function useDashboardConflicts(params) {
  return useApi(useCallback(() => dashboardApi.conflicts(params), [params]), [params])
}

export function useDashboardComplaints(params) {
  return useApi(useCallback(() => dashboardApi.complaints(params), [params]), [params])
}

export function useDashboardDepartments(params) {
  return useApi(useCallback(() => dashboardApi.departments(params), [params]), [params])
}

export function useDashboardActivity(params) {
  return useApi(
    useCallback(() => dashboardApi.activity(params), [params]),
    [params]
  )
}

// Loads several resources in parallel behind a single loading/error pair.
export function useCombined(loaders) {
  const keys = Object.keys(loaders)
  const key = keys.join(",")
  return useApi(
    useCallback(async () => {
      const results = await Promise.all(keys.map((k) => loaders[k]()))
      return Object.fromEntries(keys.map((k, i) => [k, results[i]]))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]),
    [key],
    { initialData: null }
  )
}
