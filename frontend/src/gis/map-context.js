import { createContext } from 'react'

// Holds the live Leaflet map instance. Split from the provider component so the
// module exports either components or values, never both — the same convention
// as context/auth-context.js, and what keeps react-refresh working.
export const MapContext = createContext(null)
