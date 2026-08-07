import { useContext } from 'react'
import { NotificationContext } from '../context/notification-context'

// The shared notification state: list, unread count, and the read actions. Every
// notification surface reads from here, so the app holds exactly one copy.
export function useNotificationCenter() {
  const context = useContext(NotificationContext)

  if (!context) {
    throw new Error('useNotificationCenter must be used inside NotificationProvider')
  }

  return context
}
