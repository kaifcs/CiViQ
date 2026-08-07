import { createContext } from 'react'

// Split from AuthContext.jsx so this module exports a value and that one a
// component, never both — the condition react-refresh needs to hot reload a
// provider without remounting the tree.
export const AuthContext = createContext(null)
