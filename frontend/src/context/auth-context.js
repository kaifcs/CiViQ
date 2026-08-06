import { createContext } from 'react'

// Split from AuthContext.jsx so this module exports a value and that one
// exports a component, never both — the condition react-refresh needs to hot
// reload a provider without remounting the tree. gis/map-context.js and
// notification-context.js follow the same convention.
export const AuthContext = createContext(null)
