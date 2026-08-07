// Server-Sent Events transport for notifications; NotificationContext stays the
// owner of the state. The stream authenticates with a short-lived single-use
// ticket, so EventSource's own reconnect cannot work and is reimplemented here.

import { adaptNotification } from "./adapters"
import apiClient, { TOKEN_KEY } from "./apiClient"

const RECONNECT_BASE_MS = 2000
const RECONNECT_MAX_MS = 30000

async function fetchTicket() {
  const { data } = await apiClient.post("/notifications/stream-ticket")
  return data?.ticket || null
}

export function openNotificationStream({
  onCreated, onRead, onReadAll, onReconnect,
  onArchived, onUnarchived, onDeleted, onPreferences,
} = {}) {
  if (typeof EventSource === "undefined") return () => {}

  let source = null
  let retryTimer = null
  let attempts = 0
  let everOpened = false
  let stopped = false

  const parse = (event) => {
    try {
      return JSON.parse(event.data)
    } catch {
      return null
    }
  }

  function scheduleReconnect() {
    if (stopped) return
    attempts += 1
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempts - 1), RECONNECT_MAX_MS)
    retryTimer = setTimeout(connect, delay)
  }

  async function connect() {
    if (stopped) return
    // No session, nothing to subscribe to.
    if (!localStorage.getItem(TOKEN_KEY)) return

    let ticket
    try {
      ticket = await fetchTicket()
    } catch {
      // A 401 clears the session elsewhere; anything else is worth retrying.
      scheduleReconnect()
      return
    }
    if (!ticket || stopped) return

    const base = (apiClient.defaults.baseURL || "").replace(/\/+$/, "")
    try {
      source = new EventSource(`${base}/notifications/stream?ticket=${encodeURIComponent(ticket)}`)
    } catch {
      scheduleReconnect()
      return
    }

    source.onopen = () => {
      attempts = 0
      // The first open is covered by the provider's initial REST load; later
      // ones follow a dropped connection, where events may have been missed.
      if (everOpened) onReconnect?.()
      everOpened = true
    }

    source.onerror = () => {
      // The ticket is spent, so the browser's own retry would only 401.
      // Close and reconnect with a fresh one.
      source?.close()
      source = null
      scheduleReconnect()
    }

    source.addEventListener("notification.created", (event) => {
      const doc = parse(event)
      if (doc) onCreated?.(adaptNotification(doc))
    })

    source.addEventListener("notification.read", (event) => {
      const doc = parse(event)
      if (doc) onRead?.(adaptNotification(doc))
    })

    source.addEventListener("notification.read_all", () => {
      onReadAll?.()
    })

    // Lifecycle events carry the ids they touched; single and bulk actions use
    // the same shape so one handler covers both.
    source.addEventListener("notification.archived", (event) => {
      const payload = parse(event)
      if (payload?.ids) onArchived?.(payload.ids)
    })

    source.addEventListener("notification.unarchived", (event) => {
      const payload = parse(event)
      if (payload?.ids) onUnarchived?.(payload.ids)
    })

    source.addEventListener("notification.deleted", (event) => {
      const payload = parse(event)
      if (payload?.ids) onDeleted?.(payload.ids)
    })

    source.addEventListener("notification.preferences_updated", (event) => {
      const payload = parse(event)
      if (payload?.preferences) onPreferences?.(payload.preferences)
    })
  }

  connect()

  return () => {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (source) {
      source.onopen = null
      source.onerror = null
      source.close()
      source = null
    }
  }
}
