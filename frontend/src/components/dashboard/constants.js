// Shared vocabulary matching backend enums and adapter output.
export const PROJECT_STATUSES = ['pending', 'approved', 'active', 'rejected', 'completed', 'rescheduled']
export const PROJECT_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  active: 'Active',
  rejected: 'Rejected',
  completed: 'Completed',
  rescheduled: 'Rescheduled',
}

// Project states requiring no further scheduling.
export const PROJECT_TERMINAL_STATUSES = ['completed', 'rejected']
export const PROJECT_PROGRESSABLE_STATUSES = ['approved', 'active']

export const COMPLAINT_STATUSES = ['submitted', 'acknowledged', 'in_progress', 'resolved']
export const COMPLAINT_STATUS_LABELS = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

// adaptConflict's view vocabulary.
export const CONFLICT_STATUS_LABELS = {
  unresolved: 'Unresolved',
  pending_response: 'Awaiting officer',
  resolved: 'Resolved',
}

// Raw Conflict.status labels used by analytics.
export const CONFLICT_RAW_STATUS_LABELS = {
  pending: 'Pending',
  awaiting_officer: 'Awaiting officer',
  resolved_both: 'Resolved — both approved',
  resolved_rejected: 'Resolved — one rejected',
}

// Raw Conflict.severity labels used by analytics.
export const CONFLICT_SEVERITY_LABELS = {
  incompatible: 'Incompatible',
  conditional: 'Conditional',
}

export const projectStatusLabel = (s) => PROJECT_STATUS_LABELS[s] || s || '—'
export const complaintStatusLabel = (s) => COMPLAINT_STATUS_LABELS[s] || s || '—'
export const conflictStatusLabel = (s) => CONFLICT_STATUS_LABELS[s] || s || '—'

export const isTerminalProject = (p) => PROJECT_TERMINAL_STATUSES.includes(p?.status)

// Whether project progress can be recorded.
export const canRecordProgress = (p) => PROJECT_PROGRESSABLE_STATUSES.includes(p?.status)

// Combined labels for screens using multiple vocabularies.
export const STATUS_LABELS = {
  ...PROJECT_STATUS_LABELS,
  ...COMPLAINT_STATUS_LABELS,
}

// Audit actions emitted by the backend.
export const AUDIT_ACTION_LABELS = {
  project_created: 'Created project',
  project_updated: 'Updated project',
  project_approved: 'Approved project',
  project_rejected: 'Rejected project',
  project_status_updated: 'Changed project active state',
  progress_updated: 'Updated progress',
  conflict_resolved: 'Resolved conflict',
  conflict_responded: 'Responded to a conflict',
  complaint_created: 'Created complaint',
  complaint_updated: 'Updated complaint',
  complaint_status_updated: 'Updated complaint status',
  complaint_assigned: 'Assigned complaint',
  profile_updated: 'Updated own profile',
  password_changed: 'Changed own password',
  user_created: 'Created account',
  user_updated: 'Updated user',
  user_status_updated: 'Changed user active state',
  department_created: 'Created department',
  department_updated: 'Updated department',
  department_status_updated: 'Changed department active state',
}

// Falls back to the raw action.
export const auditActionLabel = (action) => AUDIT_ACTION_LABELS[action] || action || '—'

// Filter options derived from audit labels.
export const AUDIT_ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

// MCDM criteria and their weights.
export const MCDM_CRITERIA = [
  { key: 'conditionSeverity',     label: 'Condition Severity',           weight: 26, measured: true  },
  { key: 'populationImpact',      label: 'Population & Facility Impact', weight: 21, measured: false },
  { key: 'seasonalCompatibility', label: 'Seasonal Compatibility',       weight: 16, measured: true  },
  { key: 'executionReadiness',    label: 'Execution Readiness',          weight: 16, measured: true  },
  { key: 'citizenDisruption',     label: 'Citizen Disruption',           weight: 10, measured: true  },
  { key: 'infrastructureAge',     label: 'Infrastructure Age',           weight:  8, measured: true  },
  { key: 'economicValue',         label: 'Economic Value',               weight:  3, measured: false },
]

// Note shown for unmeasured criteria.
export const UNMEASURED_CRITERION_NOTE =
  'Not measured — no data source. Scored neutral for every project, so it changes no ranking.'

// Returns the visual width for a measured criterion score.
export const criterionWidth = (breakdown, key) => {
  if (MCDM_CRITERIA.find((c) => c.key === key)?.measured === false) return '0%'
  const value = breakdown?.[key]
  return Number.isFinite(value) ? `${Math.max(0, Math.min(100, value * 10))}%` : '0%'
}