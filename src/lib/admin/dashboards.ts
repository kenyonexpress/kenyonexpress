import { type Agorot, agorot, sumAgorot } from '@/lib/money'

/**
 * Pure aggregation for the admin dashboards screen. Every amount is integer
 * agorot; nullable DB columns count as zero, and a non-integer is a bug that
 * `agorot()` rejects loudly rather than a value to round.
 */

/** Order statuses whose money was actually collected. */
export const REVENUE_ORDER_STATUSES = [
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
] as const

export interface OrderRow {
  status: string
  total_ils_agorot: number | null
}

export interface LedgerBalanceRow {
  kind: string
  natural_balance_agorot: number | string | null
}

export interface OrdersSummary {
  total: number
  byStatus: Record<string, number>
  paidCount: number
  paidSum: Agorot
}

export function summarizeOrders(rows: readonly OrderRow[]): OrdersSummary {
  const byStatus: Record<string, number> = {}
  const paid: Agorot[] = []
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    if ((REVENUE_ORDER_STATUSES as readonly string[]).includes(row.status)) {
      paid.push(agorot(row.total_ils_agorot ?? 0))
    }
  }
  return { total: rows.length, byStatus, paidCount: paid.length, paidSum: sumAgorot(paid) }
}

export function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const k = key(row)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/** Natural balance summed over every ledger account of one kind. */
export function ledgerKindTotal(rows: readonly LedgerBalanceRow[], kind: string): Agorot {
  return sumAgorot(
    rows.filter((r) => r.kind === kind).map((r) => agorot(Number(r.natural_balance_agorot ?? 0))),
  )
}
