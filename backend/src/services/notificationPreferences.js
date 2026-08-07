// The single source of truth for "should this notification be delivered?".
// Persistence is never gated on preferences: every notification is stored so
// history stays complete, and these govern delivery and default visibility only.

const {
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_CATEGORIES,
  MANDATORY_CATEGORIES,
} = require("../config/notificationTypes")

const CHANNELS = ["email", "inApp"]

// Every channel/category pair on.
function defaultPreferences() {
  const prefs = {}
  for (const channel of CHANNELS) {
    prefs[channel] = {}
    for (const category of NOTIFICATION_CATEGORY_VALUES) prefs[channel][category] = true
  }
  return prefs
}

// True when a category can never be switched off.
function isMandatory(category) {
  return MANDATORY_CATEGORIES.includes(category)
}

// Missing preferences read as opted in, so an account that has never visited
// the settings screen still receives everything.
function isEnabled(preferences, channel, category) {
  if (isMandatory(category)) return true
  const value = preferences?.[channel]?.[category]
  return value === undefined || value === null ? true : Boolean(value)
}

// Categories the user still wants in the in-app feed.
function visibleCategories(preferences) {
  return NOTIFICATION_CATEGORY_VALUES.filter((c) => isEnabled(preferences, "inApp", c))
}

const categoryOf = (notification) => notification?.category || NOTIFICATION_CATEGORIES.SYSTEM

// Also requires an address and an active account.
function shouldSendEmail(notification, user) {
  if (!user?.email || user.isActive === false) return false
  return isEnabled(user.notificationPreferences, "email", categoryOf(notification))
}

function shouldSendRealtime(notification, user) {
  return isEnabled(user?.notificationPreferences, "inApp", categoryOf(notification))
}

function shouldDisplayNotification(notification, preferences) {
  return isEnabled(preferences, "inApp", categoryOf(notification))
}

// Drops unknown channels and categories and forces mandatory ones on, so a
// client cannot switch off an account notice.
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
