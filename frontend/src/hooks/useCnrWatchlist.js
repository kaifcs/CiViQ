import { useCallback, useState } from "react"

const KEY = "civiq_cnr_watchlist"

// Device-local list of CNR ids a citizen has filed or is following. Complaints
// carry no reporter reference and POST /complaints is anonymous, so the CNR
// receipt held on the device is the only way to answer "my complaints".
export function useCnrWatchlist() {
  const [cnrs, setCnrs] = useState(() => read())

  const add = useCallback((raw) => {
    const cnr = normalise(raw)
    if (!cnr) return false
    setCnrs((prev) => {
      if (prev.includes(cnr)) return prev
      const next = [cnr, ...prev]
      write(next)
      return next
    })
    return true
  }, [])

  const remove = useCallback((cnr) => {
    setCnrs((prev) => {
      const next = prev.filter((c) => c !== cnr)
      write(next)
      return next
    })
  }, [])

  return { cnrs, add, remove }
}

// CNR ids are issued as CNR-100001; accept a bare number too.
export function normalise(raw) {
  const value = String(raw || "").trim().toUpperCase()
  if (!value) return null
  if (/^CNR-\d+$/.test(value)) return value
  if (/^\d+$/.test(value)) return `CNR-${value}`
  return null
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]")
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage can be unavailable (private mode, quota); the list simply does
    // not persist in that case.
  }
}
