// The single source of notification state for the whole app: the badge, the
// dropdown and the Notification Center all read from here, so one fetch serves
// every consumer and the unread count can never disagree between them.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NotificationContext } from './notification-context'
import { notificationsApi, openNotificationStream } from '../services'
import { useAuth } from '../hooks/useAuth'

export function NotificationProvider({ children }) {
  const { user } = useAuth()

  const [data, setData] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preferences, setPreferences] = useState(null)

  // The list is capped server-side, so the badge reads its own exact count
  // rather than counting what happened to be returned. Both are fetched in one
  // round trip and refreshed together.
  const load = useCallback(async (signal) => {
    setLoading(true)
    setError(null)
    try {
      const [list, count, prefs] = await Promise.all([
        notificationsApi.list(),
        notificationsApi.unreadCount(),
        notificationsApi.getPreferences().catch(() => null),
      ])
      if (!signal?.aborted) {
        setData(list)
        setUnreadCount(count)
        if (prefs) setPreferences(prefs)
      }
    } catch (err) {
      if (!signal?.aborted) setError(err)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setData([])
      setUnreadCount(0)
      setError(null)
      setPreferences(null)
      return
    }
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [user, load])

  const reload = useCallback(() => load(), [load])

  const reloadRef = useRef(reload)
  reloadRef.current = reload

  const dataRef = useRef(data)
  dataRef.current = data

  const applyCreated = useCallback((incoming) => {
    if (!incoming?.id) return
    setData((prev) => {
      // A tab that triggered the change may already hold it; never render twice.
      if (prev.some((n) => n.id === incoming.id)) return prev
      return [incoming, ...prev]
    })
    setUnreadCount((c) => (incoming.read ? c : c + 1))
  }, [])

  const applyRead = useCallback((incoming) => {
    if (!incoming?.id) return
    const existing = dataRef.current.find((n) => n.id === incoming.id)
    // Already read locally: the count was decremented when it happened.
    if (!existing || existing.read) return
    setUnreadCount((c) => Math.max(0, c - 1))
    setData((prev) => prev.map((n) => (n.id === incoming.id ? incoming : n)))
  }, [])

  const applyReadAll = useCallback(() => {
    setData((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })))
    setUnreadCount(0)
  }, [])

  // Archived and deleted rows both leave the default feed; the difference is
  // only whether they remain retrievable, which is a backend concern.
  const removeLocally = useCallback((ids) => {
    const wanted = new Set(ids)
    const going = dataRef.current.filter((n) => wanted.has(n.id))
    if (going.length === 0) return
    const unread = going.filter((n) => !n.read).length
    if (unread > 0) setUnreadCount((c) => Math.max(0, c - unread))
    setData((prev) => prev.filter((n) => !wanted.has(n.id)))
  }, [])

  useEffect(() => {
    if (!user) return
    const close = openNotificationStream({
      onCreated: applyCreated,
      onRead: applyRead,
      onReadAll: applyReadAll,
      onArchived: removeLocally,
      onDeleted: removeLocally,
      // An unarchive puts a row back into the default feed, which needs the
      // record itself rather than just its id.
      onUnarchived: () => reloadRef.current(),
      onPreferences: setPreferences,
      // Anything missed while disconnected comes back over REST.
      onReconnect: () => reloadRef.current(),
    })
    return close
  }, [user, applyCreated, applyRead, applyReadAll, removeLocally])

  // Archive and delete are optimistic and revert on failure, like markRead. The
  // server also broadcasts the change for other tabs; this one has already
  // converged, so its own broadcast arrives as a no-op.

  const runLifecycle = useCallback(async (ids, call) => {
    const wanted = Array.isArray(ids) ? ids : [ids]
    if (wanted.length === 0) return
    const snapshot = data
    const snapshotCount = unreadCount
    removeLocally(wanted)
    try {
      await call(wanted)
    } catch {
      setData(snapshot)
      setUnreadCount(snapshotCount)
    }
  }, [data, unreadCount, removeLocally])

  const archive = useCallback(
    (ids) => runLifecycle(ids, notificationsApi.archive),
    [runLifecycle]
  )

  const remove = useCallback(
    (ids) => runLifecycle(ids, notificationsApi.remove),
    [runLifecycle]
  )

  const loadPreferences = useCallback(async () => {
    try {
      setPreferences(await notificationsApi.getPreferences())
    } catch { /* the panel falls back to "all enabled" until this succeeds */ }
  }, [])

  const savePreferences = useCallback(async (patch) => {
    const snapshot = preferences
    // Optimistic so the toggle responds immediately.
    setPreferences((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(patch).map(([channel, cats]) => [channel, { ...prev?.[channel], ...cats }])
      ),
    }))
    try {
      const saved = await notificationsApi.updatePreferences(patch)
      if (saved) setPreferences(saved)
      // Muting a category changes what the feed should contain, so the list and
      // count are re-read from the server rather than recomputed here.
      reloadRef.current()
    } catch {
      setPreferences(snapshot)
    }
  }, [preferences])

  const markRead = useCallback(async (id) => {
    const target = data.find((n) => n.id === id)
    if (!target || target.read) return
    // Optimistic: the row and the badge move together, and revert together.
    setData((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      const saved = await notificationsApi.markRead(id)
      setData((prev) => prev.map((n) => (n.id === id ? saved : n)))
    } catch {
      setData((prev) => prev.map((n) => (n.id === id ? target : n)))
      setUnreadCount((c) => c + 1)
    }
  }, [data])

  const markAllRead = useCallback(async () => {
    const snapshot = data
    const previousCount = unreadCount
    if (previousCount === 0 && !snapshot.some((n) => !n.read)) return
    setData((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })))
    setUnreadCount(0)
    try {
      await notificationsApi.markAllRead()
    } catch {
      setData(snapshot)
      setUnreadCount(previousCount)
    }
  }, [data, unreadCount])

  const value = useMemo(
    () => ({
      data, loading, error, reload, unreadCount, markRead, markAllRead,
      archive, remove, preferences, loadPreferences, savePreferences,
    }),
    [data, loading, error, reload, unreadCount, markRead, markAllRead,
     archive, remove, preferences, loadPreferences, savePreferences]
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
