import { StatCard } from '../Card'

// Only two column counts are in use across the five dashboards; naming them
// keeps the responsive breakpoints identical everywhere.
const COLUMNS = {
  5: 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  7: 'grid-cols-2 lg:grid-cols-4 xl:grid-cols-7',
}

/**
 * Responsive row of KPI cards. `stats` is [{ label, value, sub, danger }];
 * `danger` turns the value red only when it is a non-zero count, so an empty
 * queue never reads as an alert.
 */
export default function StatGrid({ stats = [], columns = 7 }) {
  return (
    <div className={`grid gap-3 ${COLUMNS[columns] || COLUMNS[7]}`}>
      {stats.map((s) => (
        <StatCard
          key={s.label}
          label={s.label}
          value={s.value}
          valueColor={s.danger && Number(s.value) > 0 ? 'danger' : 'default'}
          subLabel={s.sub}
        />
      ))}
    </div>
  )
}
