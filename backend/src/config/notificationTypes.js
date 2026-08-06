// Single definition of the notification vocabulary. Types were previously bare
// string literals repeated across notificationService; every producer and
// consumer now reads them from here.
//
// Category and priority are derived from the type rather than passed in, so a
// given event always renders consistently and callers cannot drift.

const NOTIFICATION_TYPES = {
  CLASH_DETECTED: "clash_detected",
  PROJECT_APPROVED: "project_approved",
  PROJECT_REJECTED: "project_rejected",
  PROJECT_ASSIGNED: "project_assigned",
  PROJECT_COMPLETED: "project_completed",
  EARLY_COMPLETION: "early_completion",
  COMPLAINT_ASSIGNED: "complaint_assigned",
  COMPLAINT_STATUS_CHANGED: "complaint_status_changed",
  ROLE_CHANGED: "role_changed",
}

const NOTIFICATION_CATEGORIES = {
  PROJECT: "project",
  COMPLAINT: "complaint",
  CONFLICT: "conflict",
  SYSTEM: "system",
}

const NOTIFICATION_PRIORITIES = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
}

// Every type maps to exactly one category and priority.
const TYPE_METADATA = {
  [NOTIFICATION_TYPES.CLASH_DETECTED]: {
    category: NOTIFICATION_CATEGORIES.CONFLICT,
    priority: NOTIFICATION_PRIORITIES.HIGH,
  },
  [NOTIFICATION_TYPES.PROJECT_APPROVED]: {
    category: NOTIFICATION_CATEGORIES.PROJECT,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
  },
  [NOTIFICATION_TYPES.PROJECT_REJECTED]: {
    category: NOTIFICATION_CATEGORIES.PROJECT,
    priority: NOTIFICATION_PRIORITIES.HIGH,
  },
  [NOTIFICATION_TYPES.PROJECT_ASSIGNED]: {
    category: NOTIFICATION_CATEGORIES.PROJECT,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
  },
  [NOTIFICATION_TYPES.PROJECT_COMPLETED]: {
    category: NOTIFICATION_CATEGORIES.PROJECT,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
  },
  [NOTIFICATION_TYPES.EARLY_COMPLETION]: {
    category: NOTIFICATION_CATEGORIES.PROJECT,
    priority: NOTIFICATION_PRIORITIES.LOW,
  },
  [NOTIFICATION_TYPES.ROLE_CHANGED]: {
    category: NOTIFICATION_CATEGORIES.SYSTEM,
    priority: NOTIFICATION_PRIORITIES.HIGH,
  },
  [NOTIFICATION_TYPES.COMPLAINT_ASSIGNED]: {
    category: NOTIFICATION_CATEGORIES.COMPLAINT,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
  },
  [NOTIFICATION_TYPES.COMPLAINT_STATUS_CHANGED]: {
    category: NOTIFICATION_CATEGORIES.COMPLAINT,
    priority: NOTIFICATION_PRIORITIES.LOW,
  },
}

// Account and security notices are not optional: a user who no longer has the
// role they think they have must be told regardless of their preferences.
const MANDATORY_CATEGORIES = [NOTIFICATION_CATEGORIES.SYSTEM]

const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES)
const NOTIFICATION_CATEGORY_VALUES = Object.values(NOTIFICATION_CATEGORIES)
const NOTIFICATION_PRIORITY_VALUES = Object.values(NOTIFICATION_PRIORITIES)

// Unknown types fall back to system/normal so a notification is never lost to a
// validation error; the enum on the model is what rejects genuinely bad input.
const DEFAULT_METADATA = {
  category: NOTIFICATION_CATEGORIES.SYSTEM,
  priority: NOTIFICATION_PRIORITIES.NORMAL,
}

function metadataForType(type) {
  return TYPE_METADATA[type] || DEFAULT_METADATA
}

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
  MANDATORY_CATEGORIES,
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_PRIORITY_VALUES,
  metadataForType,
}
