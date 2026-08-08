// Shared Tailwind styles for badges, statuses, and form elements.
// Status labels come from dashboard constants and map colours from GIS styles.

import { PROJECT_STATUS_COLORS } from '../gis/projectStyles'

// Hash department codes into a stable palette so every department gets a
// deterministic badge style without maintaining a fixed department list.
const DEPT_PALETTE = [
  'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#0A1220] dark:text-[#60A5FA]',
  'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  'bg-[#FEFCE8] text-[#A16207] dark:bg-[#181305] dark:text-[#FACC15]',
  'bg-[#F5F3FF] text-[#6D28D9] dark:bg-[#130C22] dark:text-[#A78BFA]',
  'bg-[#FFF7ED] text-[#C2410C] dark:bg-[#1A0E05] dark:text-[#FB923C]',
  'bg-[#ECFEFF] text-[#0E7490] dark:bg-[#04181C] dark:text-[#22D3EE]',
  'bg-[#FDF2F8] text-[#BE185D] dark:bg-[#1C0713] dark:text-[#F472B6]',
  'bg-[#EEF2FF] text-[#4338CA] dark:bg-[#131629] dark:text-[#818CF8]',
]

// Fallback style for unresolved departments.
const DEPT_UNKNOWN = 'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]'

// Deterministic: the same code always maps to the same palette entry.
export function deptStyle(code) {
  if (!code) return DEPT_UNKNOWN
  const key = String(code)
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return DEPT_PALETTE[hash % DEPT_PALETTE.length]
}

export const TYPE_STYLES = {
  Road:       'bg-[#FFF7ED] text-[#C2410C] dark:bg-[#1A0E05] dark:text-[#FB923C]',
  Water:      'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#0A1220] dark:text-[#60A5FA]',
  Sewage:     'bg-[#F5F3FF] text-[#6D28D9] dark:bg-[#130C22] dark:text-[#A78BFA]',
  Electrical: 'bg-[#FEFCE8] text-[#A16207] dark:bg-[#181305] dark:text-[#FACC15]',
  Parks:      'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  Other:      'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]',
}

export const ROLE_STYLES = {
  admin:      'bg-[#EEF2FF] text-[#4338CA] dark:bg-[#131629] dark:text-[#818CF8]',
  officer:    'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  supervisor: 'bg-[#FFF7ED] text-[#C2410C] dark:bg-[#1A0E05] dark:text-[#FB923C]',
}

export const SEVERITY_CONFIG = {
  high:   { text: 'High',   bg: 'bg-[#FEF2F2] dark:bg-[#1F0A0A]', color: 'text-[#B91C1C] dark:text-[#F87171]' },
  medium: { text: 'Medium', bg: 'bg-[#FFFBEB] dark:bg-[#181305]', color: 'text-[#92400E] dark:text-[#FACC15]' },
  low:    { text: 'Low',    bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]' },
}

// Project status chips use the same colours as GIS markers.
export const PROJECT_STATUS_CONFIG = {
  pending:     { dot: PROJECT_STATUS_COLORS.pending,     text: 'Pending',     bg: 'bg-[#F8FAFC] dark:bg-[#1A1F2B]', color: 'text-[#475569] dark:text-[#64748B]' },
  approved:    { dot: PROJECT_STATUS_COLORS.approved,    text: 'Approved',    bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]' },
  active:      { dot: PROJECT_STATUS_COLORS.active,      text: 'Active',      bg: 'bg-[#EEF2FF] dark:bg-[#131629]', color: 'text-[#4338CA] dark:text-[#818CF8]' },
  rejected:    { dot: PROJECT_STATUS_COLORS.rejected,    text: 'Rejected',    bg: 'bg-[#FEF2F2] dark:bg-[#1F0A0A]', color: 'text-[#B91C1C] dark:text-[#F87171]' },
  completed:   { dot: PROJECT_STATUS_COLORS.completed,   text: 'Completed',   bg: 'bg-[#F1F5F9] dark:bg-[#1A1F2B]', color: 'text-[#475569] dark:text-[#64748B]' },
  rescheduled: { dot: PROJECT_STATUS_COLORS.rescheduled, text: 'Rescheduled', bg: 'bg-[#FFFBEB] dark:bg-[#1A1205]', color: 'text-[#92400E] dark:text-[#FACC15]' },
}

// Filter options stay in sync with the supported project statuses.
export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS_CONFIG).map(
  ([value, { text }]) => ({ value, label: text })
)

export const COMPLAINT_STATUS_CONFIG = {
  submitted:    { text: 'Submitted',    dot: '#94A3B8', bg: 'bg-[#F8FAFC] dark:bg-[#1A1F2B]', color: 'text-[#475569] dark:text-[#64748B]' },
  acknowledged: { text: 'Acknowledged', dot: '#5E6AD2', bg: 'bg-[#EEF2FF] dark:bg-[#131629]', color: 'text-[#4338CA] dark:text-[#818CF8]' },
  in_progress:  { text: 'In Progress',  dot: '#D97706', bg: 'bg-[#FFFBEB] dark:bg-[#181305]', color: 'text-[#92400E] dark:text-[#FACC15]' },
  resolved:     { text: 'Resolved',     dot: '#16A34A', bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]' },
}

// adaptConflict's view vocabulary, not the raw Conflict.status enum.
export const CONFLICT_STATUS_CONFIG = {
  unresolved:        { text: 'Unresolved',        bg: 'bg-[#FEF2F2] dark:bg-[#1F0A0A]', color: 'text-[#B91C1C] dark:text-[#F87171]', dot: '#DC2626' },
  pending_response: { text: 'Pending Response', bg: 'bg-[#FFFBEB] dark:bg-[#181305]', color: 'text-[#92400E] dark:text-[#FACC15]', dot: '#D97706' },
  resolved:          { text: 'Resolved',          bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]', dot: '#16A34A' },
}

export const scoreColor = (s) => (s >= 75 ? '#16A34A' : s >= 60 ? '#D97706' : '#DC2626')

export const inputCls = "w-full h-10 px-3 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"

export const labelCls = "block text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1.5"