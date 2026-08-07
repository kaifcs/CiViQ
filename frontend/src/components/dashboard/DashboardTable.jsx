import { useMemo, useState } from 'react'
import { LoadingState, ErrorState, EmptyState } from '../AsyncState'

// Compact table for dashboard widgets, rendered through the shared AsyncState
// primitives. `columns` is [{ key, header, render?, className?, width?,
// sortable?, sortValue? }]; `render` keeps domain vocabulary out of here.
export default function DashboardTable({
  columns = [],
  rows = [],
  loading = false,
  error = null,
  onRetry,
  onRowClick,
  emptyTitle = 'Nothing here yet',
  emptyHint,
  getRowKey = (row, i) => row?.id ?? i,
  defaultSort = null,
}) {
  const [sort, setSort] = useState(defaultSort)

  const sortedRows = useMemo(() => {
    if (!sort?.key) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return rows

    const value = column.sortValue || ((row) => row[column.key])
    const dir = sort.dir === 'desc' ? -1 : 1

    // Copy first: callers pass memoised arrays that must not be mutated.
    return [...rows].sort((a, b) => {
      const av = value(a), bv = value(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, sort, columns])

  const toggleSort = (key) =>
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    )

  if (loading) return <LoadingState label="Loading..." />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                  onKeyDown={c.sortable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(c.key) }
                  } : undefined}
                  tabIndex={c.sortable ? 0 : undefined}
                  role={c.sortable ? 'button' : undefined}
                  className={[
                    'text-left text-[11px] font-semibold uppercase tracking-[0.06em] pb-2 px-1 whitespace-nowrap',
                    active ? 'text-[#5E6AD2]' : 'text-[#9CA3AF] dark:text-[#6B7280]',
                    c.sortable ? 'cursor-pointer select-none hover:text-[#5E6AD2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2] rounded-[3px]' : '',
                  ].join(' ')}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.header}
                  {c.sortable && (
                    <span className="ml-1 text-[9px]" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr
              key={getRowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={[
                'border-t border-[#F1F5F9] dark:border-[#27272A]',
                onRowClick ? 'cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] transition-colors' : '',
              ].join(' ')}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={['py-2.5 px-1 text-[13px] text-[#0F172A] dark:text-[#F8FAFC] align-middle', c.className || ''].join(' ')}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
