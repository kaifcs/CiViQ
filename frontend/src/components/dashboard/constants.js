// Vocabulary shared by every dashboard.
//
// Keys mirror the backend enums exactly (Project.status, Complaint.status and
// the conflict vocabulary adaptConflict emits), so a label change lands in one
// place rather than five.

export const PROJECT_STATUSES = ['pending', 'approved', 'active', 'rejected', 'completed', 'rescheduled']

export const PROJECT_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  active: 'Active',
  rejected: 'Rejected',
  completed: 'Completed',
  rescheduled: 'Rescheduled',
}

/** Statuses after which a project needs no further scheduling attention. */
export const PROJECT_TERMINAL_STATUSES = ['completed', 'rejected']

export const PROJECT_PROGRESSABLE_STATUSES = ['approved', 'active']

export const COMPLAINT_STATUSES = ['submitted', 'acknowledged', 'in_progress', 'resolved']

export const COMPLAINT_STATUS_LABELS = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

/** adaptConflict's view vocabulary, not the raw Conflict.status enum. */
export const CONFLICT_STATUS_LABELS = {
  unresolved: 'Unresolved',
  pending_response: 'Awaiting officer',
  resolved: 'Resolved',
}

/**
 * The raw Conflict.status enum, which the analytics endpoints report verbatim
 * because they aggregate in the database rather than through adaptConflict.
 */
export const CONFLICT_RAW_STATUS_LABELS = {
  pending: 'Pending',
  awaiting_officer: 'Awaiting officer',
  resolved_both: 'Resolved — both approved',
  resolved_rejected: 'Resolved — one rejected',
}

/** Conflict.severity enum, likewise reported verbatim by the analytics endpoints. */
export const CONFLICT_SEVERITY_LABELS = {
  incompatible: 'Incompatible',
  conditional: 'Conditional',
}

export const projectStatusLabel = (s) => PROJECT_STATUS_LABELS[s] || s || '—'
export const complaintStatusLabel = (s) => COMPLAINT_STATUS_LABELS[s] || s || '—'
export const conflictStatusLabel = (s) => CONFLICT_STATUS_LABELS[s] || s || '—'

export const isTerminalProject = (p) => PROJECT_TERMINAL_STATUSES.includes(p?.status)

/** Whether PUT /api/projects/:id/progress would be accepted for this project. */
export const canRecordProgress = (p) => PROJECT_PROGRESSABLE_STATUSES.includes(p?.status)

/** Combined lookup for screens that mix both vocabularies (analytics). */
export const STATUS_LABELS = {
  ...PROJECT_STATUS_LABELS,
  ...COMPLAINT_STATUS_LABELS,
}

/**
 * Every action services/auditService is actually called with, and nothing else.
 *
 * The five per-screen copies this replaces each listed only a handful, and
 * between them offered four labels (`project_submitted`, `user_created`,
 * `user_deactivated`, `mcdm_override`) that no call site emits — so real
 * entries rendered as raw snake_case while the filter offered values that
 * could never match. Keys mirror the `action` strings in the controllers.
 */
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
}

/** Falls back to the raw action so an entry is never rendered blank. */
export const auditActionLabel = (action) => AUDIT_ACTION_LABELS[action] || action || '—'

/** Filter options, derived from the labels so the two cannot drift. */
export const AUDIT_ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

/**
 * The seven MCDM criteria, in the order the engine weights them.
 *
 * `key` matches the field mcdmEngine writes into Project.mcdmBreakdown and
 * `weight` mirrors config/staticConfig.mcdmWeights as a percentage. Previously
 * redeclared in four detail screens; now that the keys are semantically tied to
 * engine output, a drifting copy would render the wrong criterion rather than
 * merely a different label.
 */
export const MCDM_CRITERIA = [
  { key: 'conditionSeverity',     label: 'Condition Severity',           weight: 26 },
  { key: 'populationImpact',      label: 'Population & Facility Impact', weight: 21 },
  { key: 'seasonalCompatibility', label: 'Seasonal Compatibility',       weight: 16 },
  { key: 'executionReadiness',    label: 'Execution Readiness',          weight: 16 },
  { key: 'citizenDisruption',     label: 'Citizen Disruption',           weight: 10 },
  { key: 'infrastructureAge',     label: 'Infrastructure Age',           weight:  8 },
  { key: 'economicValue',         label: 'Economic Value',               weight:  3 },
]

/**
 * Bar width for one criterion. Scores are 1-10, so the bar is that share of the
 * track; a project stored before mcdmBreakdown existed has no value and renders
 * empty rather than borrowing the overall score.
 */
export const criterionWidth = (breakdown, key) => {
  const value = breakdown?.[key]
  return Number.isFinite(value) ? `${Math.max(0, Math.min(100, value * 10))}%` : '0%'
}
