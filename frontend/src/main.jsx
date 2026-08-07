// Application entry point. Provider order matters: NotificationProvider reads
// the session through useAuth, so it must sit inside AuthProvider — that is what
// keeps the signed-out app from opening a notification stream.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import AppRouter from './router/AppRouter'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <NotificationProvider>
        <AppRouter />
      </NotificationProvider>
    </AuthProvider>
  </StrictMode>
)