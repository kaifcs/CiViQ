import { useContext } from 'react'
import { AuthContext } from '../context/auth-context'

// Reads the authenticated session. Throws outside AuthProvider so the mistake
// surfaces at the offending component rather than as an unexplained undefined
// further down the tree.
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
