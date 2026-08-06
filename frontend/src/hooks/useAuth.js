import { useContext } from 'react'
import { AuthContext } from '../context/auth-context'

/**
 * Reads the authenticated session: user, department index and the auth actions.
 *
 * Throws rather than returning null when used outside AuthProvider, so the
 * mistake surfaces at the offending component instead of as an unexplained
 * undefined further down the tree.
 */
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
