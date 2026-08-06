// Shared API client with JWT authentication and centralised error handling.

import axios from "axios"

export const TOKEN_KEY = "civiq_token"
export const USER_KEY = "civiq_user"

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: { "Content-Type": "application/json" },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Broadcast 401s so AuthContext can clear session state without this module
// importing React. Avoids a circular dependency between api and context.
export const AUTH_EXPIRED_EVENT = "civiq:auth-expired"

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    return Promise.reject(error)
  }
)

/**
 * Collapses any backend error into { status, message }.
 * Error envelopes differ per module ({ success, message } vs bare { message }).
 */
export function normaliseError(error) {
  const status = error?.response?.status ?? 0
  const data = error?.response?.data
  const message =
    (data && typeof data === "object" && (data.error?.message || data.message)) ||
    (typeof data === "string" && data) ||
    error?.message ||
    "Something went wrong"
  // Stable machine-readable code from the standard error envelope. Callers that
  // only read `message` are unaffected; `code` is null for anything older.
  const code = (data && typeof data === "object" && data.error?.code) || null
  // The backend echoes its correlation id on every response. Carrying it here
  // lets a reported fault be matched to the exact server-side log line. It is
  // never rendered — no internal detail is exposed to the user.
  const requestId = error?.response?.headers?.["x-request-id"] || null
  return { status, message, code, requestId }
}

/** Read opt-in pagination metadata the backend returns as headers. */
export function readPagination(response) {
  const h = response?.headers || {}
  if (h["x-total-count"] === undefined) return null
  return {
    total: Number(h["x-total-count"]),
    page: Number(h["x-page"]),
    limit: Number(h["x-limit"]),
    totalPages: Number(h["x-total-pages"]),
    hasNext: h["x-has-next"] === "true",
    hasPrevious: h["x-has-previous"] === "true",
  }
}

export default apiClient
