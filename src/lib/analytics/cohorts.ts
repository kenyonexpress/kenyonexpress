/**
 * Revenue cohorts for the admin analytics page.
 *
 * A cohort is the Asia/Jerusalem month of a customer's FIRST paid order.
 * Each later month is an offset from that month, and the grid answers two
 * questions: how many of the cohort bought again at offset N (retention), and
 * how much money the cohort brought in by then (cumulative revenue per
 * customer, the LTV curve).
 *
 * The same two rules as aggregate.ts: money comes only from ledger rows,
 * never from events, and a business month is an Israel month. Money stays in
 * integer agorot end to end; the one division (revenue per customer) goes
 * through the shared half-up integer primitive.
 */

import { divRoundHalfUp } from '@/lib/money'

export type CohortOrder = {
  orderId: string
  userId: string
  /** ISO timestamp of orders.paid_at. */
  paidAt: string
  /** What was charged on site for the order, in integer agorot. */
  revenueAgorot: number
}

export type CohortCell = {
  /** Months after the cohort month; 0 is the acquisition month itself. */
  offset: number
  /** Customers of the cohort with at least one paid order in this month. */
  activeCustomers: number
  /** activeCustomers / cohort size, one decimal, as a percentage. */
  retentionPct: number
  /** Revenue in this month only, agorot. */
  revenueAgorot: number
  /** Revenue from the cohort month through this month, agorot. */
  cumulativeRevenueAgorot: number
  /** cumulativeRevenueAgorot / cohort size, half-up agorot. */
  cumulativePerCustomerAgorot: number
}

export type CohortRow = {
  /** YYYY-MM in Asia/Jerusalem. */
  cohort: string
  customers: number
  orders: number
  revenueAgorot: number
  /** Lifetime revenue per customer over the window, half-up agorot. */
  ltvAgorot: number
  /** Cells for offsets 0..maxOffset that fall inside the window; later offsets are absent. */
  cells: CohortCell[]
}

const israelMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
})

/** The Israel business month of a timestamp, as YYYY-MM. */
export function israelMonthKey(iso: string): string {
  // en-CA yields YYYY-MM for a year+month format.
  return israelMonthFormatter.format(new Date(iso))
}

function monthIndex(key: string): number {
  const [year, month] = key.split('-')
  return Number(year) * 12 + (Number(month) - 1)
}

/** Whole months from `from` to `to`; negative when `to` is earlier. */
export function monthOffset(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function assertAgorot(value: number, orderId: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`revenueAgorot must be an integer (order ${orderId}: ${value})`)
  }
}

export type CohortOptions = {
  /**
   * The last month that has complete data, YYYY-MM. A cohort gets a cell for
   * every offset up to this month and no further, so the grid never shows a
   * zero for a month that has not happened yet.
   */
  throughMonth: string
  /** Cap on offsets shown; the LTV curve flattens long before 24. */
  maxOffset?: number
}

/**
 * Builds the cohort grid. Orders are keyed by userId: a customer belongs to
 * the month of their earliest paid order in the input, so the caller must
 * pass a window that starts at the earliest acquisition it wants counted,
 * or a returning customer will look newly acquired.
 */
export function buildRevenueCohorts(
  orders: readonly CohortOrder[],
  options: CohortOptions,
): CohortRow[] {
  const maxOffset = options.maxOffset ?? 12
  const throughIndex = monthIndex(options.throughMonth)

  // Deduplicate on orderId: the loader reads orders, not items, but a retried
  // query or a join could still hand the same order twice.
  const seenOrders = new Set<string>()
  const unique: CohortOrder[] = []
  for (const order of orders) {
    if (seenOrders.has(order.orderId)) continue
    seenOrders.add(order.orderId)
    assertAgorot(order.revenueAgorot, order.orderId)
    unique.push(order)
  }

  // First paid month per customer.
  const firstMonth = new Map<string, string>()
  for (const order of unique) {
    const month = israelMonthKey(order.paidAt)
    const current = firstMonth.get(order.userId)
    if (current === undefined || month < current) firstMonth.set(order.userId, month)
  }

  type Accumulator = {
    customers: Set<string>
    orders: number
    revenueAgorot: number
    byOffset: Map<number, { active: Set<string>; revenueAgorot: number }>
  }
  const cohorts = new Map<string, Accumulator>()

  for (const order of unique) {
    const cohort = firstMonth.get(order.userId)
    if (cohort === undefined) continue
    const offset = monthOffset(cohort, israelMonthKey(order.paidAt))
    let acc = cohorts.get(cohort)
    if (!acc) {
      acc = { customers: new Set(), orders: 0, revenueAgorot: 0, byOffset: new Map() }
      cohorts.set(cohort, acc)
    }
    acc.customers.add(order.userId)
    acc.orders += 1
    acc.revenueAgorot += order.revenueAgorot
    let cell = acc.byOffset.get(offset)
    if (!cell) {
      cell = { active: new Set(), revenueAgorot: 0 }
      acc.byOffset.set(offset, cell)
    }
    cell.active.add(order.userId)
    cell.revenueAgorot += order.revenueAgorot
  }

  return [...cohorts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, acc]) => {
      const size = acc.customers.size
      const visibleOffsets = Math.min(maxOffset, throughIndex - monthIndex(cohort))
      const cells: CohortCell[] = []
      let cumulative = 0
      for (let offset = 0; offset <= visibleOffsets; offset += 1) {
        const cell = acc.byOffset.get(offset)
        const revenue = cell?.revenueAgorot ?? 0
        cumulative += revenue
        cells.push({
          offset,
          activeCustomers: cell?.active.size ?? 0,
          retentionPct: size > 0 ? round1(((cell?.active.size ?? 0) / size) * 100) : 0,
          revenueAgorot: revenue,
          cumulativeRevenueAgorot: cumulative,
          cumulativePerCustomerAgorot: size > 0 ? divRoundHalfUp(cumulative, size) : 0,
        })
      }
      return {
        cohort,
        customers: size,
        orders: acc.orders,
        revenueAgorot: acc.revenueAgorot,
        ltvAgorot: size > 0 ? divRoundHalfUp(acc.revenueAgorot, size) : 0,
        cells,
      }
    })
}

export type CohortTotals = {
  cohorts: number
  customers: number
  orders: number
  revenueAgorot: number
  /** Customers with a paid order at offset 1 or later, over all customers. */
  repeatCustomers: number
  repeatRatePct: number
}

/**
 * Headline numbers over the grid. Takes the orders as well as the rows
 * because the repeat count cannot be read off the cells: a customer active in
 * two later months sits in two cells, and summing them would count them
 * twice.
 */
export function cohortTotals(
  rows: readonly CohortRow[],
  orders: readonly CohortOrder[],
): CohortTotals {
  let customers = 0
  let orderCount = 0
  let revenueAgorot = 0
  for (const row of rows) {
    customers += row.customers
    orderCount += row.orders
    revenueAgorot += row.revenueAgorot
  }
  const repeatCustomers = repeatCustomerCount(orders)
  return {
    cohorts: rows.length,
    customers,
    orders: orderCount,
    revenueAgorot,
    repeatCustomers,
    repeatRatePct: customers > 0 ? round1((repeatCustomers / customers) * 100) : 0,
  }
}

/**
 * Customers with a paid order in a month after their acquisition month.
 */
export function repeatCustomerCount(orders: readonly CohortOrder[]): number {
  const firstMonth = new Map<string, string>()
  for (const order of orders) {
    const month = israelMonthKey(order.paidAt)
    const current = firstMonth.get(order.userId)
    if (current === undefined || month < current) firstMonth.set(order.userId, month)
  }
  const repeat = new Set<string>()
  for (const order of orders) {
    const first = firstMonth.get(order.userId)
    if (first !== undefined && israelMonthKey(order.paidAt) > first) repeat.add(order.userId)
  }
  return repeat.size
}
