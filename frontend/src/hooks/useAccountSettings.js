// Self-service profile and password forms shared by every role's Settings
// page, so the request, validation and session-sync logic lives in one place
// rather than being re-typed per screen.

import { useEffect, useState } from "react"
import { useAuth } from "./useAuth"
import { authApi, normaliseError } from "../services"
import { adaptUser } from "../services/adapters"

// Within the 3-5s window the Settings pages ask for a confirmation to stay
// visible.
const CONFIRMATION_MS = 4000

// PUT /api/auth/profile — always the caller's own record. `applyUserUpdate`
// adopts the response into the live session, so the navbar and this form
// reflect the change without a re-login. AuthContext.user is the only source
// of truth for the saved name; the local `name` state is just the draft.
export function useProfileForm() {
  const { user, deptMap, applyUserUpdate } = useAuth()
  const [name, setNameState] = useState(user?.name || "")
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Keeps the draft aligned with the session's own name whenever it changes
  // from outside this form (boot, or another tab's write) and the field is
  // not mid-edit — so this screen can never drift from what the server holds.
  useEffect(() => {
    if (!dirty) setNameState(user?.name || "")
  }, [user?.name, dirty])

  function setName(v) {
    setNameState(v)
    setDirty(true)
    setError("")
  }

  async function save() {
    if (saving) return // A second click while the first request is in flight must not fire a duplicate write.
    if (!name.trim()) {
      setError("Display name cannot be empty")
      setSaved(false)
      return
    }
    setError("")
    setSaved(false)
    setSaving(true)
    try {
      const raw = await authApi.updateProfile({ fullName: name.trim() })
      applyUserUpdate(adaptUser(raw, deptMap))
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), CONFIRMATION_MS)
    } catch (err) {
      setError(normaliseError(err).message || "Could not save your changes.")
    } finally {
      setSaving(false)
    }
  }

  return { name, setName, error, saved, saving, save }
}

// PUT /api/auth/password. The backend reports a wrong current password as a
// plain validation error (400), not 401, so a typo here never triggers the
// app's global logout-on-401 handling.
export function usePasswordForm() {
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  function clearError(setter) {
    return (v) => { setter(v); setError(""); setSuccess(false) }
  }

  async function change() {
    if (saving) return // A second click while the first request is in flight must not fire a duplicate write.
    // Any earlier success indicator is cleared as soon as a new attempt
    // starts, validation failure or not — it must never sit next to an error.
    setSuccess(false)
    if (!currentPw || !newPw || !confirmPw) {
      setError("Fill in all three password fields")
      return
    }
    if (newPw.length < 8) {
      setError("New password must be at least 8 characters long")
      return
    }
    if (newPw !== confirmPw) {
      setError("New password and confirmation do not match")
      return
    }
    setError("")
    setSaving(true)
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw, confirmPassword: confirmPw })
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
      setSuccess(true)
      setTimeout(() => setSuccess(false), CONFIRMATION_MS)
    } catch (err) {
      setError(normaliseError(err).message || "Could not update your password.")
    } finally {
      setSaving(false)
    }
  }

  return {
    currentPw, setCurrentPw: clearError(setCurrentPw),
    newPw, setNewPw: clearError(setNewPw),
    confirmPw, setConfirmPw: clearError(setConfirmPw),
    error, success, saving, change,
  }
}
