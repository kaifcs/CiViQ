// The single source of truth for "should this notification be delivered?".
//
// Nothing else in the repository decides this. NotificationService consults
// these helpers once per notification and passes the answer to the email and
// real-time channels; the read side uses the same helpers to keep the feed and
// the unread count consistent with what the user asked to see.
//
// Persistence is never gated: every notification is stored so history stays
// complete, and preferences only govern delivery and default visibility.

const {
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_CATEGORIES,
  MANDATORY_CATEGORIES,
} = require("../config/notificationTypes")

const CHANNELS = ["email", "inApp"]

/** Every channel/category pair on, which is how the system behaved before N5. */
function defaultPreferences() {
  const prefs = {}
  for (const channel of CHANNELS) {
    prefs[channel] = {}
    for (const category of NOTIFICATION_CATEGORY_VALUES) prefs[channel][category] = true
  }
  return prefs
}

/** True when a category can never be switched off. */
function isMandatory(category) {
  return MANDATORY_CATEGORIES.includes(category)
}

/**
 * Resolves one channel/category pair. Missing preferences mean "not yet
 * configured", which reads as opted in — a user who has never visited the
 * settings still receives everything.
 */
function isEnabled(preferences, channel, category) {
  if (isMandatory(category)) return true
  const value = preferences?.[channel]?.[category]
  return value === undefined || value === null ? true : Boolean(value)
}

/** Categories the user still wants in the in-app feed. */
function visibleCategories(preferences) {
  return NOTIFICATION_CATEGORY_VALUES.filter((c) => isEnabled(preferences, "inApp", c))
}

const categoryOf = (notification) => notification?.category || NOTIFICATION_CATEGORIES.SYSTEM

/** Email delivery (N3). Also requires an address and an active account. */
function shouldSendEmail(notification, user) {
  if (!user?.email || user.isActive === false) return false
  return isEnabled(user.notificationPreferences, "email", categoryOf(notification))
}

/** Real-time delivery (N4). */
function shouldSendRealtime(notification, user) {
  return isEnabled(user?.notificationPreferences, "inApp", categoryOf(notification))
}

/** Feed and unread-count visibility (N5). */
function shouldDisplayNotification(notification, preferences) {
  return isEnabled(preferences, "inApp", categoryOf(notification))
}

/**
 * Normalises a preferences patch: unknown channels and categories are dropped,
 * values are coerced to booleans, and mandatory categories are forced on so a
 * client cannot switch off an account notice.
 */
function sanitisePreferences(patch, current) {
  const next = { ...defaultPreferences(), ...structuredClone(current || {}) }
  for (const channel of CHANNELS) {
    next[channel] = { ...defaultPreferences()[channel], ...(current?.[channel] || {}) }
    const incoming = patch?.[channel]
    if (!incoming || typeof incoming !== "object") continue
    for (const [category, value] of Object.entries(incoming)) {
      if (!NOTIFICATION_CATEGORY_VALUES.includes(category)) continue
      next[channel][category] = isMandatory(category) ? true : Boolean(value)
    }
  }
  return next
}

module.exports = {
  CHANNELS,
  defaultPreferences,
  sanitisePreferences,
  isMandatory,
  isEnabled,
  visibleCategories,
  shouldSendEmail,
  shouldSendRealtime,
  shouldDisplayNotification,
}
