// N5 — delivery preferences.
//
// The one place that answers "should this notification be delivered?". The
// invariant worth protecting is that preferences govern DELIVERY and default
// VISIBILITY only — never persistence — and that a client cannot switch off a
// mandatory category.

const test = require("node:test")
const assert = require("node:assert/strict")
const {
  CHANNELS, defaultPreferences, sanitisePreferences, isMandatory, isEnabled,
  visibleCategories, shouldSendEmail, shouldSendRealtime, shouldDisplayNotification,
} = require("../../src/services/notificationPreferences")
const {
  NOTIFICATION_CATEGORY_VALUES, NOTIFICATION_CATEGORIES, MANDATORY_CATEGORIES,
} = require("../../src/config/notificationTypes")

const activeUser = (preferences) => ({
  email: "user@civiq.test", isActive: true, notificationPreferences: preferences,
})

test("defaults enable every channel and category", () => {
  const prefs = defaultPreferences()
  for (const channel of CHANNELS) {
    for (const category of NOTIFICATION_CATEGORY_VALUES) {
      assert.equal(prefs[channel][category], true, `${channel}/${category} should default on`)
    }
  }
})

// A user who has never opened the settings screen must still receive everything.
test("absent preferences read as opted in", () => {
  assert.equal(isEnabled(undefined, "inApp", NOTIFICATION_CATEGORIES.PROJECT), true)
  assert.equal(isEnabled({}, "email", NOTIFICATION_CATEGORIES.PROJECT), true)
  assert.equal(isEnabled({ inApp: {} }, "inApp", NOTIFICATION_CATEGORIES.PROJECT), true)
  assert.equal(isEnabled({ inApp: { project: null } }, "inApp", NOTIFICATION_CATEGORIES.PROJECT), true)
})

test("an explicit false opts out", () => {
  assert.equal(isEnabled({ inApp: { project: false } }, "inApp", NOTIFICATION_CATEGORIES.PROJECT), false)
})

test("mandatory categories cannot be switched off", () => {
  assert.ok(MANDATORY_CATEGORIES.length > 0, "at least one category must be mandatory")
  for (const category of MANDATORY_CATEGORIES) {
    assert.equal(isMandatory(category), true)
    assert.equal(isEnabled({ inApp: { [category]: false } }, "inApp", category), true)
    assert.equal(isEnabled({ email: { [category]: false } }, "email", category), true)
  }
})

test("sanitisePreferences forces mandatory categories back on", () => {
  const category = MANDATORY_CATEGORIES[0]
  const result = sanitisePreferences({ inApp: { [category]: false } }, defaultPreferences())
  assert.equal(result.inApp[category], true, "a client must not be able to mute an account notice")
})

test("sanitisePreferences drops unknown channels and categories", () => {
  const result = sanitisePreferences(
    { inApp: { notACategory: false }, sms: { project: false }, __proto__: { polluted: true } },
    defaultPreferences()
  )
  assert.equal(result.inApp.notACategory, undefined)
  assert.equal(result.sms, undefined)
  assert.equal(result.polluted, undefined)
  assert.deepEqual(Object.keys(result).sort(), [...CHANNELS].sort())
})

test("sanitisePreferences coerces values to booleans", () => {
  const result = sanitisePreferences({ inApp: { project: 0, complaint: "yes" } }, defaultPreferences())
  assert.equal(result.inApp.project, false)
  assert.equal(result.inApp.complaint, true)
})

test("sanitisePreferences preserves settings the patch does not mention", () => {
  const current = sanitisePreferences({ inApp: { project: false } }, defaultPreferences())
  const next = sanitisePreferences({ email: { complaint: false } }, current)
  assert.equal(next.inApp.project, false, "an unrelated patch must not reset an opt-out")
  assert.equal(next.email.complaint, false)
})

test("sanitisePreferences does not mutate the current preferences", () => {
  const current = defaultPreferences()
  sanitisePreferences({ inApp: { project: false } }, current)
  assert.equal(current.inApp.project, true, "the stored object must not be edited in place")
})

test("a patch of null or a non-object is a no-op", () => {
  const current = defaultPreferences()
  assert.deepEqual(sanitisePreferences(null, current), current)
  assert.deepEqual(sanitisePreferences({ inApp: "nonsense" }, current), current)
})

test("visibleCategories reflects the in-app opt-outs only", () => {
  assert.deepEqual(visibleCategories(defaultPreferences()), NOTIFICATION_CATEGORY_VALUES)

  const muted = sanitisePreferences({ inApp: { project: false } }, defaultPreferences())
  const visible = visibleCategories(muted)
  assert.ok(!visible.includes(NOTIFICATION_CATEGORIES.PROJECT))
  assert.equal(visible.length, NOTIFICATION_CATEGORY_VALUES.length - 1)

  // An email opt-out must not hide anything from the feed.
  const emailOnly = sanitisePreferences({ email: { project: false } }, defaultPreferences())
  assert.deepEqual(visibleCategories(emailOnly), NOTIFICATION_CATEGORY_VALUES)
})

test("email delivery requires an address and an active account", () => {
  const note = { category: NOTIFICATION_CATEGORIES.PROJECT }
  assert.equal(shouldSendEmail(note, activeUser(defaultPreferences())), true)
  assert.equal(shouldSendEmail(note, { email: null, isActive: true }), false)
  assert.equal(shouldSendEmail(note, { email: "u@x.test", isActive: false }), false)
  assert.equal(shouldSendEmail(note, undefined), false)
})

test("channels are independent", () => {
  const note = { category: NOTIFICATION_CATEGORIES.PROJECT }
  const emailMuted = sanitisePreferences({ email: { project: false } }, defaultPreferences())
  assert.equal(shouldSendEmail(note, activeUser(emailMuted)), false)
  assert.equal(shouldSendRealtime(note, activeUser(emailMuted)), true, "muting email must not mute the stream")

  const inAppMuted = sanitisePreferences({ inApp: { project: false } }, defaultPreferences())
  assert.equal(shouldSendRealtime(note, activeUser(inAppMuted)), false)
  assert.equal(shouldSendEmail(note, activeUser(inAppMuted)), true)
})

// A notification saved before categories existed has none; it must not vanish.
test("a notification without a category is treated as system", () => {
  const uncategorised = {}
  assert.equal(shouldSendRealtime(uncategorised, activeUser(defaultPreferences())), true)
  assert.equal(shouldDisplayNotification(uncategorised, defaultPreferences()), true)
  // system is mandatory, so even a full opt-out still displays it
  const muted = sanitisePreferences(
    { inApp: Object.fromEntries(NOTIFICATION_CATEGORY_VALUES.map((c) => [c, false])) },
    defaultPreferences()
  )
  assert.equal(shouldDisplayNotification(uncategorised, muted), true)
})
