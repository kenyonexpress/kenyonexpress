/**
 * The cohort retention triangle, built from the nightly snapshot rows.
 *
 * `report_cohort_retention` (170) stores one row per (cohort month, month
 * offset) that has at least one active user, and stores NOTHING for a pair
 * with none. A grid that renders "no row" as 0% is therefore wrong in one
 * specific and expensive way: for the newest cohort, every offset past the
 * current month has no row because THAT MONTH HAS NOT HAPPENED YET, and
 * drawing 0% there tells the operator their newest customers churned
 * completely. They did not; nobody has had the chance to come back.
 *
 * So a missing cell is two different facts and this module separates them:
 *
 *   `future`  the month is later than the current Israel month. Unknowable.
 *   `value`   the month has elapsed. A missing row here really is 0 returning
 *             users, and 0% is the honest number.
 *
 * Percentages, not money, so the integer-agorot rule does not apply and a
 * float rate is correct. Nothing in this file touches an agorot column.
 */

/** One cell of the triangle. */
export type CohortCell = { kind: 'value'; activeUsers: number; rate: number } | { kind: 'future' }

/** One cohort: the users whose first paid order fell in `cohortMonth`. */
export interface CohortRow {
  /** First day of the cohort month, `YYYY-MM-DD`, as the snapshot stores it. */
  cohortMonth: string
  cohortSize: number
  /** Index is the month offset; index 0 is the cohort month itself. */
  cells: CohortCell[]
}

export interface CohortGrid {
  rows: CohortRow[]
  /** Widest elapsed offset across all cohorts, so the header can be built. */
  maxOffset: number
  /** The rebuild these rows came from, or null when there are no rows. */
  refreshedAt: string | null
}

/**
 * A year of columns and no more.
 *
 * Not a data limit, a reading limit: past twelve the row is wider than any
 * screen and the interesting part (months 1-3) gets squeezed out of view. The
 * snapshot keeps every offset it computed; this only decides how many are
 * drawn.
 */
export const MAX_COHORT_OFFSET = 12

/** Months from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-')
  const [ty, tm] = to.split('-')
  return (Number(ty) - Number(fy)) * 12 + (Number(tm) - Number(fm))
}

/**
 * The first day of the current Israel month, `YYYY-MM-DD`.
 *
 * Israel and not UTC for the same reason 170 buckets on
 * `at time zone 'Asia/Jerusalem'`: for the first three hours of every Israel
 * day the two disagree, and on the 1st of the month that disagreement is a
 * whole column of the grid flipping between `future` and `value`.
 */
export function currentIsraelMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${year}-${month}-01`
}

/**
 * Turns the snapshot rows into a triangle, newest cohort first.
 *
 * Newest first because that is the cohort an operator is deciding about this
 * week; the year-old one is history and can be scrolled to.
 */
export function buildCohortGrid(
  cells: ReadonlyArray<{
    cohortMonth: string
    monthOffset: number
    cohortSize: number
    activeUsers: number
    refreshedAt: string
  }>,
  now: Date = new Date(),
): CohortGrid {
  if (cells.length === 0) return { rows: [], maxOffset: 0, refreshedAt: null }

  const thisMonth = currentIsraelMonth(now)

  // Group by cohort month. `cohortSize` is identical on every row of a cohort
  // by construction, so the last one read wins and it does not matter which.
  const byCohort = new Map<string, { size: number; active: Map<number, number> }>()
  for (const cell of cells) {
    const existing = byCohort.get(cell.cohortMonth)
    if (existing) {
      existing.size = cell.cohortSize
      existing.active.set(cell.monthOffset, cell.activeUsers)
    } else {
      byCohort.set(cell.cohortMonth, {
        size: cell.cohortSize,
        active: new Map([[cell.monthOffset, cell.activeUsers]]),
      })
    }
  }

  const months = [...byCohort.keys()].sort()

  // The header is as wide as the oldest cohort has had time to be observed,
  // capped. Taking it from the widest ELAPSED span and not from the widest
  // populated offset is what keeps a trailing run of true zeros visible: a
  // cohort that stopped returning in month 2 has no rows past it, and sizing
  // the grid to the data would hide exactly that.
  let maxOffset = 0
  for (const month of months) {
    maxOffset = Math.max(maxOffset, Math.min(monthsBetween(month, thisMonth), MAX_COHORT_OFFSET))
  }

  const rows: CohortRow[] = months
    .slice()
    .reverse()
    .map((cohortMonth) => {
      const cohort = byCohort.get(cohortMonth)
      const size = cohort?.size ?? 0
      const elapsed = monthsBetween(cohortMonth, thisMonth)
      const cells: CohortCell[] = []
      for (let offset = 0; offset <= maxOffset; offset += 1) {
        if (offset > elapsed) {
          cells.push({ kind: 'future' })
          continue
        }
        const activeUsers = cohort?.active.get(offset) ?? 0
        cells.push({
          kind: 'value',
          activeUsers,
          rate: size > 0 ? (activeUsers / size) * 100 : 0,
        })
      }
      return { cohortMonth, cohortSize: size, cells }
    })

  return { rows, maxOffset, refreshedAt: cells[0]?.refreshedAt ?? null }
}

/** `2026-07-01` -> `יולי 2026`. */
export function cohortMonthLabel(month: string): string {
  const [year, monthPart] = month.split('-')
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1, 12))
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(date)
}
