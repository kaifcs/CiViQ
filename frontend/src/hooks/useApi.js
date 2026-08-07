import { useCallback, useEffect, useRef, useState } from "react"
import { normaliseError } from "../services"

// Runs an async loader and exposes { data, loading, error, reload }.
export function useApi(loader, deps = [], { skip = false, initialData = null } = {}) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (skip) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    // Guarded twice: `cancelled` discards a superseded request, `alive` blocks
    // state updates after unmount.
    Promise.resolve(loader())
      .then((result) => { if (!cancelled && alive.current) setData(result) })
      .catch((err) => { if (!cancelled && alive.current) setError(normaliseError(err)) })
      .finally(() => { if (!cancelled && alive.current) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, skip])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload, setData }
}

// Wraps a write call so screens can surface backend validation messages.
export function useMutation(fn) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const run = useCallback(async (...args) => {
    setSaving(true)
    setError(null)
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      const e = normaliseError(err)
      setError(e)
      return { ok: false, error: e }
    } finally {
      setSaving(false)
    }
  }, [fn])

  return { run, saving, error, setError }
}
