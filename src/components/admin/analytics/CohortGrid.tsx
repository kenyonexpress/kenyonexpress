import type { CohortGrid as Grid } from '@/lib/analytics/cohorts'
import { cohortMonthLabel } from '@/lib/analytics/cohorts'

/**
 * The retention triangle, server-rendered, no chart library.
 *
 * Shaded by rate rather than coloured by category: there is one measure and it
 * is ordered, so a sequential ramp of a single hue is the correct encoding and
 * a categorical palette would invent distinctions that do not exist. The rate
 * is also printed in every cell, so the shading is decoration and the table is
 * still readable in monochrome or by a screen reader.
 *
 * A `future` cell renders as an em dash and carries a spoken explanation, for
 * the reason `buildCohortGrid` exists at all: blank and 0% are different
 * claims and the newest cohort is where the difference is largest.
 */

/** Five steps, light to dark. Text flips to white on the two darkest. */
function shade(rate: number): string {
  if (rate >= 80) return 'bg-emerald-700 text-white'
  if (rate >= 60) return 'bg-emerald-600 text-white'
  if (rate >= 40) return 'bg-emerald-400 text-emerald-950'
  if (rate >= 20) return 'bg-emerald-200 text-emerald-950'
  if (rate > 0) return 'bg-emerald-100 text-emerald-950'
  return 'bg-gray-50 text-black/40'
}

function percent(rate: number): string {
  return `${rate.toLocaleString('he-IL', { maximumFractionDigits: rate % 1 === 0 ? 0 : 1 })}%`
}

export default function CohortGrid({ grid }: { grid: Grid }) {
  if (grid.rows.length === 0) {
    return (
      <p className="text-sm text-black/50">
        אין עדיין אף קוהורטה. קוהורטה נוצרת מהרכישה המשולמת הראשונה של לקוח מזוהה, ולכן הזמנת אורח
        אינה נספרת כאן.
      </p>
    )
  }

  const offsets = Array.from({ length: grid.maxOffset + 1 }, (_, i) => i)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <caption className="sr-only">
          שיעור הלקוחות מכל חודש הצטרפות שביצעו רכישה משולמת נוספת בחודשים שאחריו
        </caption>
        <thead>
          <tr className="border-b border-gray-200 text-xs text-black/50">
            <th scope="col" className="py-2 pe-3 text-start font-medium">
              חודש הצטרפות
            </th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">
              לקוחות
            </th>
            {offsets.map((offset) => (
              <th key={offset} scope="col" className="px-2 py-2 text-center font-medium">
                {offset === 0 ? 'החודש עצמו' : `+${offset}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.cohortMonth} className="border-b border-gray-100 last:border-0">
              <th scope="row" className="py-2 pe-3 text-start font-medium text-heading">
                {cohortMonthLabel(row.cohortMonth)}
              </th>
              <td className="py-2 pe-3 text-black/70">{row.cohortSize.toLocaleString('he-IL')}</td>
              {row.cells.map((cell, offset) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the month offset
                  key={offset}
                  className="px-1 py-1 text-center"
                >
                  {cell.kind === 'future' ? (
                    <span
                      className="block rounded px-2 py-1.5 text-black/30"
                      title="החודש עוד לא הגיע"
                    >
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">החודש עוד לא הגיע</span>
                    </span>
                  ) : (
                    <span
                      className={`block rounded px-2 py-1.5 font-medium ${shade(cell.rate)}`}
                      title={`${cell.activeUsers.toLocaleString('he-IL')} מתוך ${row.cohortSize.toLocaleString('he-IL')}`}
                    >
                      {percent(cell.rate)}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
