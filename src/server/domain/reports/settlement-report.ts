/**
 * The admin reports, aggregated from `settlement_events` and from nothing else.
 *
 * WHY NOT FROM `payout_statements`, WHICH IS WHAT THE EXISTING SCREEN READS
 *
 * Because it does not exist. Measured against production on 2026-08-06:
 * `information_schema` returns ZERO tables matching `%payout%` and ZERO
 * functions matching `%payout%`, while `src/server/actions/admin/payouts.ts`
 * calls `generate_payout_statement` and then selects from `payout_statements`.
 * That screen is broken in production today, and building four more reports on
 * the same missing table would have produced four more broken screens that look
 * finished.
 *
 * `settlement_events` (migration 094, extended by 106) is the append-only money
 * journal: one row per event, carrying the split it was computed under and a
 * timestamp. It is what the reports are supposed to be reporting.
 *
 * WHAT THE MODEL FORBIDS, AND WHAT THIS IS CALLED INSTEAD
 *
 * The goal said "open escrow balances". There is no Escrow here and no J5 hold
 * (decision C3): `escrow_holds` is an internal ledger record until redemption.
 * So the figure is an OPEN OBLIGATION TO A SUPPLIER — money the platform has
 * taken and not yet released — and neither the word "escrow" nor "נאמנות"
 * appears in the UI.
 *
 * Pure. The reads live in `server/queries/reports.ts`; every rule about what a
 * number MEANS is decided here, where it can be asserted against a fixture
 * instead of against a database with no rows in it yet.
 */

export type SettlementEventKind =
  | 'charge_settled'
  | 'voucher_redeemed'
  | 'voucher_expired'
  | 'refund_issued'
  | 'discount_funded'
  | 'payout_settled'
  | 'supplier_debit'

export interface ReportEvent {
  kind: SettlementEventKind
  occurredAt: string
  supplierId: string | null
  supplierName?: string | null
  paidOnSiteAgorot: number
  commissionAgorot: number
  supplierDueAgorot: number
  discountAgorot: number
}

export interface PeriodTotals {
  /** `2026-08-06` for a day, `2026-08` for a month. */
  period: string
  /** Money customers paid on the site. */
  grossAgorot: number
  /** The platform's share of it. */
  commissionAgorot: number
  /** The suppliers' share. */
  supplierDueAgorot: number
  /** Returned to customers. Positive; the sign is the field, not the number. */
  refundedAgorot: number
  /** Funded by the platform as a campaign discount. */
  discountAgorot: number
  /** Number of settled charges in the period. */
  orders: number
}

/**
 * Israel, not UTC. A sale at 01:00 on the 1st belongs to the 1st for the person
 * reading the report, and a month boundary read in UTC moves three hours of
 * every month's revenue into the previous one.
 */
const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function israelDay(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return ISRAEL_DAY.format(date)
}

export function israelMonth(iso: string): string | null {
  return israelDay(iso)?.slice(0, 7) ?? null
}

function emptyPeriod(period: string): PeriodTotals {
  return {
    period,
    grossAgorot: 0,
    commissionAgorot: 0,
    supplierDueAgorot: 0,
    refundedAgorot: 0,
    discountAgorot: 0,
    orders: 0,
  }
}

/**
 * Buckets events by day or by month.
 *
 * A `refund_issued` carries the refunded amount POSITIVE in
 * `paid_on_site_agorot` — 094's CHECK refuses negatives on every money column,
 * so the direction lives in the kind. It is therefore added to `refunded` and
 * NOT subtracted from `gross`: a report that netted them would show a day with
 * one sale and one refund as a day with no activity, which is exactly the day
 * somebody is looking for.
 */
export function aggregate(
  events: readonly ReportEvent[],
  granularity: 'day' | 'month',
): PeriodTotals[] {
  const buckets = new Map<string, PeriodTotals>()
  const key = granularity === 'day' ? israelDay : israelMonth

  for (const event of events) {
    const period = key(event.occurredAt)
    // An unparseable timestamp is skipped rather than bucketed under the epoch,
    // where it would silently become a line on the chart at 1970.
    if (!period) continue
    const bucket = buckets.get(period) ?? emptyPeriod(period)

    if (event.kind === 'charge_settled') {
      bucket.grossAgorot += event.paidOnSiteAgorot
      bucket.commissionAgorot += event.commissionAgorot
      bucket.supplierDueAgorot += event.supplierDueAgorot
      bucket.orders += 1
    } else if (event.kind === 'refund_issued') {
      bucket.refundedAgorot += event.paidOnSiteAgorot
    } else if (event.kind === 'discount_funded') {
      bucket.discountAgorot += event.discountAgorot
    }

    buckets.set(period, bucket)
  }

  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period))
}

export interface SupplierObligation {
  supplierId: string
  supplierName: string | null
  /** Released to the supplier by settled charges. */
  earnedAgorot: number
  /** Clawed back by refunds of lines that had already been split. */
  debitedAgorot: number
  /** Already paid out. */
  settledAgorot: number
  /** earned - debited - settled. May be negative: the supplier owes us. */
  openAgorot: number
}

/**
 * What the platform still owes each supplier.
 *
 * NOT called escrow anywhere, for the reason in the header. `openAgorot` is
 * allowed to go NEGATIVE and is not clamped: a supplier refunded after being
 * paid out genuinely owes money back, and a report that floored the figure at
 * zero would hide exactly the case an administrator opens this screen to find.
 */
export function supplierObligations(events: readonly ReportEvent[]): SupplierObligation[] {
  const rows = new Map<string, SupplierObligation>()

  for (const event of events) {
    if (!event.supplierId) continue
    const row = rows.get(event.supplierId) ?? {
      supplierId: event.supplierId,
      supplierName: event.supplierName ?? null,
      earnedAgorot: 0,
      debitedAgorot: 0,
      settledAgorot: 0,
      openAgorot: 0,
    }
    // A later event may carry the name when an earlier one did not.
    if (!row.supplierName && event.supplierName) row.supplierName = event.supplierName

    if (event.kind === 'charge_settled' || event.kind === 'voucher_redeemed') {
      row.earnedAgorot += event.supplierDueAgorot
    } else if (event.kind === 'supplier_debit') {
      row.debitedAgorot += event.supplierDueAgorot
    } else if (event.kind === 'payout_settled') {
      row.settledAgorot += event.supplierDueAgorot
    }

    row.openAgorot = row.earnedAgorot - row.debitedAgorot - row.settledAgorot
    rows.set(event.supplierId, row)
  }

  return [...rows.values()].sort((a, b) => b.openAgorot - a.openAgorot)
}

/** The headline figures, summed from the same buckets the table shows. */
export function summarise(periods: readonly PeriodTotals[]): Omit<PeriodTotals, 'period'> {
  return periods.reduce<Omit<PeriodTotals, 'period'>>(
    (total, period) => ({
      grossAgorot: total.grossAgorot + period.grossAgorot,
      commissionAgorot: total.commissionAgorot + period.commissionAgorot,
      supplierDueAgorot: total.supplierDueAgorot + period.supplierDueAgorot,
      refundedAgorot: total.refundedAgorot + period.refundedAgorot,
      discountAgorot: total.discountAgorot + period.discountAgorot,
      orders: total.orders + period.orders,
    }),
    {
      grossAgorot: 0,
      commissionAgorot: 0,
      supplierDueAgorot: 0,
      refundedAgorot: 0,
      discountAgorot: 0,
      orders: 0,
    },
  )
}

/**
 * Fills the gaps between the days that have events.
 *
 * A chart drawn straight from `aggregate` joins 3 August to 6 August with a
 * straight line, which reads as three days of declining sales rather than as
 * three days of none. The rows are inserted at zero so the shape is honest.
 */
export function fillDays(
  periods: readonly PeriodTotals[],
  from: string,
  to: string,
): PeriodTotals[] {
  const byPeriod = new Map(periods.map((p) => [p.period, p]))
  const out: PeriodTotals[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return [...periods]

  // Bounded: a caller asking for a decade gets a year, rather than 3652 rows
  // rendered into a chart that cannot show them.
  for (let guard = 0; cursor <= end && guard < 366; guard++) {
    const day = cursor.toISOString().slice(0, 10)
    out.push(byPeriod.get(day) ?? emptyPeriod(day))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}
