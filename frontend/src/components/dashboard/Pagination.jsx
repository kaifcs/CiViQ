// Page control for server-paged lists. Driven entirely by the pagination
// metadata the backend sends in its headers (see readPagination), so it never
// infers a page count from however many rows happened to arrive.

export default function Pagination({ pagination, page, onPageChange, label = 'records' }) {
  if (!pagination || pagination.totalPages <= 1) return null

  const { total, totalPages, hasNext, hasPrevious, limit } = pagination
  const first = (page - 1) * limit + 1
  const last = Math.min(page * limit, total)

  const btn =
    'h-8 px-3 text-[12px] font-medium rounded-[6px] border border-[#E2E8F0] dark:border-[#27272A] ' +
    'text-[#0F172A] dark:text-[#F8FAFC] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] ' +
    'disabled:opacity-40 disabled:cursor-not-allowed transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]'

  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex items-center justify-between gap-3 flex-shrink-0 pt-1"
    >
      <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
        {first}&ndash;{last} of {total} {label}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
          Page {page} of {totalPages}
        </span>
        <button type="button" className={btn} disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  )
}
