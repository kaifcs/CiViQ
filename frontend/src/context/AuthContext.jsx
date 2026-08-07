import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './auth-context'
import { authApi, departmentsApi, departmentIndex, normaliseError, TOKEN_KEY, USER_KEY } from '../services'
import { adaptUser } from '../services/adapters'
import { AUTH_EXPIRED_EVENT } from '../services/apiClient'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // id -> department index, used by the adapters to turn department ObjectId
  // references into the codes/names the screens display.
  const [deptMap, setDeptMap] = useState(() => new Map())

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  /**
   * Adopts an already-adapted user record into the live session.
   *
   * A profile save returns the updated record, so applying it here is what makes
   * the navbar follow immediately. Re-reading `GET /auth/me` instead would be a
   * second request for data the caller is already holding.
   *
   * Guarded on identity: administrators edit other accounts through the same
   * `usersApi.update`, and one of those must never overwrite the signed-in
   * session. The persisted copy is rewritten alongside the state so the two
   * cannot disagree — Login reads it back to route on the stored role.
   */
  const applyUserUpdate = useCallback((updated) => {
    if (!updated?.id) return
    setUser((current) => {
      if (!current || current.id !== updated.id) return current
      localStorage.setItem(USER_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  // apiClient dispatches this when any request comes back 401.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  // Departments are needed to resolve references, and every authenticated role
  // may read them. The index is returned as well as stored: the signed-in user
  // carries a department reference of its own, and adapting that user before
  // this resolves would leave their department permanently null.
  const loadDepartments = useCallback(async () => {
    try {
      const raw = await departmentsApi.listRaw()
      const index = departmentIndex(raw)
      setDeptMap(index)
      return index
    } catch {
      const empty = new Map()
      setDeptMap(empty)
      return empty
    }
  }, [])

  // Restore the session on boot by validating the stored token against the
  // backend, rather than trusting whatever is in localStorage.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { setLoading(false); return }

    let cancelled = false
    ;(async () => {
      try {
        const me = await authApi.me()
        if (cancelled) return
        // Departments first: adaptUser resolves the department reference
        // through this index, so it has to exist before the user is adapted.
        const index = await loadDepartments()
        if (cancelled) return
        const adapted = adaptUser(me, index)
        setUser(adapted)
        localStorage.setItem(USER_KEY, JSON.stringify(adapted))
      } catch {
        if (!cancelled) clearSession()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clearSession, loadDepartments])

  /** Returns null on success, or a message string on failure. */
  async function login(email, password) {
    try {
      const { token, user: raw } = await authApi.login(email, password)
      // Stored first: departmentsApi reads the token from storage.
      localStorage.setItem(TOKEN_KEY, token)
      const index = await loadDepartments()
      const adapted = adaptUser(raw, index)
      localStorage.setItem(USER_KEY, JSON.stringify(adapted))
      setUser(adapted)
      return null
    } catch (err) {
      // Surface the backend's own message (e.g. "Invalid email or password").
      return normaliseError(err).message
    }
  }

  async function logout() {
    await authApi.logout()
    clearSession()
  }

  const isAdmin = user?.role === 'admin'
  const isOfficer = user?.role === 'officer'
  const isSupervisor = user?.role === 'supervisor'

  function getDashboardPath() {
    if (isAdmin) return '/admin/dashboard'
    if (isOfficer) return '/officer/dashboard'
    if (isSupervisor) return '/supervisor/dashboard'
    return '/login'
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        deptMap,
        applyUserUpdate,
        refreshDepartments: loadDepartments,
        login,
        logout,
        isAdmin,
        isOfficer,
        isSupervisor,
        getDashboardPath,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
