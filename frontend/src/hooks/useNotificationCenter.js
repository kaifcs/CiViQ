import { useContext } from 'react'
import { NotificationContext } from '../context/notification-context'

/**
 * The shared notification state: list, unread count, and the read actions.
 *
 * Every notification surface reads from here, so there is exactly one fetch and
 * one copy of the state in the app.
 */
export function useNotificationCenter() {
  const context = useContext(NotificationContext)

  if (!context) {
    throw new Error('useNotificationCenter must be used inside NotificationProvider')
  }

  return context
}
