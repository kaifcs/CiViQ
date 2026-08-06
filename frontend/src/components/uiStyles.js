/**
 * Presentation constants shared by the list and detail screens.
 *
 * These maps were previously redeclared in every page that rendered a badge —
 * DEPT_STYLES in fourteen files, STATUS_CONFIG in fourteen, TYPE_STYLES in six.
 * Every copy carried identical class strings, so consolidating them changes no
 * rendered output; the maps below are supersets of the largest variant found,
 * and pages that never look up the extra keys are unaffected.
 *
 * Status *labels* live in components/dashboard/constants.js and marker *colours*
 * in gis/projectStyles.js. This module owns only Tailwind class dictionaries.
 */

import { PROJECT_STATUS_COLORS } from '../gis/projectStyles'

export const DEPT_STYLES = {
  PWD:   'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#0A1220] dark:text-[#60A5FA]',
  JAL:   'bg-[#F0FDF4] text-[#15803D] dark:bg-[#0D1F14] dark:text-[#4ADE80]',
  PVVNL: 'bg-[#FEFCE8] text-[#A16207] dark:bg-[#181305] dark:text-[#FACC15]',
  Parks: 'bg-[#F5F3FF] text-[#6D28D9] dark:bg-[#130C22] dark:text-[#A78BFA]',
  Other: 'bg-[#F8FAFC] text-[#475569] dark:bg-[#1A1F2B] dark:text-[#64748B]',
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

/** Project status chips. Dots reuse the GIS palette so map and list agree. */
export const PROJECT_STATUS_CONFIG = {
  pending:     { dot: PROJECT_STATUS_COLORS.pending,     text: 'Pending',     bg: 'bg-[#F8FAFC] dark:bg-[#1A1F2B]', color: 'text-[#475569] dark:text-[#64748B]' },
  approved:    { dot: PROJECT_STATUS_COLORS.approved,    text: 'Approved',    bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]' },
  active:      { dot: PROJECT_STATUS_COLORS.active,      text: 'Active',      bg: 'bg-[#EEF2FF] dark:bg-[#131629]', color: 'text-[#4338CA] dark:text-[#818CF8]' },
  rejected:    { dot: PROJECT_STATUS_COLORS.rejected,    text: 'Rejected',    bg: 'bg-[#FEF2F2] dark:bg-[#1F0A0A]', color: 'text-[#B91C1C] dark:text-[#F87171]' },
  completed:   { dot: PROJECT_STATUS_COLORS.completed,   text: 'Completed',   bg: 'bg-[#F1F5F9] dark:bg-[#1A1F2B]', color: 'text-[#475569] dark:text-[#64748B]' },
  rescheduled: { dot: PROJECT_STATUS_COLORS.rescheduled, text: 'Rescheduled', bg: 'bg-[#FFFBEB] dark:bg-[#1A1205]', color: 'text-[#92400E] dark:text-[#FACC15]' },
}

export const COMPLAINT_STATUS_CONFIG = {
  submitted:    { text: 'Submitted',    dot: '#94A3B8', bg: 'bg-[#F8FAFC] dark:bg-[#1A1F2B]', color: 'text-[#475569] dark:text-[#64748B]' },
  acknowledged: { text: 'Acknowledged', dot: '#5E6AD2', bg: 'bg-[#EEF2FF] dark:bg-[#131629]', color: 'text-[#4338CA] dark:text-[#818CF8]' },
  in_progress:  { text: 'In Progress',  dot: '#D97706', bg: 'bg-[#FFFBEB] dark:bg-[#181305]', color: 'text-[#92400E] dark:text-[#FACC15]' },
  resolved:     { text: 'Resolved',     dot: '#16A34A', bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]' },
}

/** adaptConflict's view vocabulary, not the raw Conflict.status enum. */
export const CONFLICT_STATUS_CONFIG = {
  unresolved:       { text: 'Unresolved',       bg: 'bg-[#FEF2F2] dark:bg-[#1F0A0A]', color: 'text-[#B91C1C] dark:text-[#F87171]', dot: '#DC2626' },
  pending_response: { text: 'Pending Response', bg: 'bg-[#FFFBEB] dark:bg-[#181305]', color: 'text-[#92400E] dark:text-[#FACC15]', dot: '#D97706' },
  resolved:         { text: 'Resolved',         bg: 'bg-[#F0FDF4] dark:bg-[#0D1F14]', color: 'text-[#15803D] dark:text-[#4ADE80]', dot: '#16A34A' },
}

/** MCDM score bands: green from 75, amber from 60, red below. */
export const scoreColor = (s) => (s >= 75 ? '#16A34A' : s >= 60 ? '#D97706' : '#DC2626')

export const inputCls = "w-full h-10 px-3 text-[14px] rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"

export const labelCls = "block text-[13px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] mb-1.5"
