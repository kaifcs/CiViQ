import { createContext } from 'react'

// Value-only module, paired with the provider in NotificationContext.jsx. See
// context/auth-context.js for why the two are kept apart.
export const NotificationContext = createContext(null)
