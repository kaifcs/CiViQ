// Shared class strings for the public portal's form controls and focus ring.
// Kept out of ui.jsx so that file exports components only.

export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFFFF]'

export const controlCls =
  'w-full rounded-[8px] border border-[#E2E8F0] bg-[#FFFFFF] text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] ' +
  'focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/15 transition-[border-color,box-shadow] duration-150'

export const inputCls = `${controlCls} h-11 px-3.5`
export const selectCls = `${inputCls} pr-9 cursor-pointer appearance-none bg-no-repeat`
export const textareaCls = `${controlCls} px-3.5 py-3 resize-y min-h-[120px] leading-relaxed`

// Chevron drawn as a data URI so a native select keeps its own keyboard and
// mobile behaviour while matching the rest of the form controls.
export const selectChevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
  backgroundPosition: 'right 12px center',
}
