/**
 * Does the money we took match the orders we closed?
 *
 * The failure this exists to surface has already happened here twice. On
 * 2026-07-27 `finalize.ts` wrote a `settlement_status` the live enum did not
 * carry, and Postgres raised 22P02 AFTER Cardcom had charged the card: money
 * taken, order never closed, and nothing in the admin panel said so. The
 * payments screen listed the payment as `succeeded` and the orders screen
 * listed the order as `pending`, and no view put the two side by side.
 *
 * `finalizeOrder` is idempotent (it returns `replay: true` when `orders.paid_at`
 * is already set), so the repair for that class of failure is simply to run it
 * again. What was missing is the question "which ones need it".
 *
 * Pure: the classifier takes rows and returns a verdict, so the tests can state
 * each failure shape without a database.
 */

export type PaymentStatus =
  | 'initiated'
  | 'redirected'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'platform_settled'

export type ReconciliationVerdict =
  /** Charged and closed. Nothing to do. */
  | 'settled'
  /** Charged, order still open. The customer paid and got nothing. */
  | 'unfinalized'
  /** Not charged yet and the order is open. Normal mid-checkout state. */
  | 'in_flight'
  /** The charge failed and the order is still open. Normal, no money moved. */
  | 'failed'
  /** Refunded. */
  | 'refunded'
  /** Order closed with no successful charge against it. */
  | 'paid_without_charge'

export interface ReconciliationRow {
  paymentId: string | null
  orderId: string
  paymentStatus: PaymentStatus | null
  paymentKind: 'charge' | 'refund' | null
  /** orders.paid_at. The single fact that says an order closed. */
  orderPaidAt: string | null
  orderStatus: string
  amountIls: number | null
  succeededAt: string | null
  transactionId: string | null
}

export interface Reconciled extends ReconciliationRow {
  verdict: ReconciliationVerdict
  /** Hebrew, shown in the row. */
  message: string
  /** Whether re-running finalize is the correct repair. */
  retryable: boolean
}

/**
 * Classifies one payment/order pair.
 *
 * `orders.paid_at` is the authority for "closed", not `orders.status`: status is
 * derived from the line settlement states and moves for reasons that have
 * nothing to do with whether the card cleared.
 */
export function reconcile(row: ReconciliationRow): Reconciled {
  const closed = row.orderPaidAt !== null

  if (row.paymentStatus === 'refunded' || row.paymentKind === 'refund') {
    return { ...row, verdict: 'refunded', message: 'הוחזר', retryable: false }
  }

  if (row.paymentStatus === 'succeeded' || row.paymentStatus === 'platform_settled') {
    if (closed) {
      return { ...row, verdict: 'settled', message: 'נגבה ונסגר', retryable: false }
    }
    // The one that matters: the customer was charged and the order never closed.
    return {
      ...row,
      verdict: 'unfinalized',
      message: 'הכרטיס חויב וההזמנה לא נסגרה. יש להריץ סגירה מחדש.',
      retryable: true,
    }
  }

  if (closed) {
    // Wallet-only orders legitimately close with no card charge, so this is a
    // question rather than an accusation.
    return {
      ...row,
      verdict: 'paid_without_charge',
      message: 'ההזמנה נסגרה בלי חיוב כרטיס מוצלח. תקין אם שולמה מהארנק במלואה.',
      retryable: false,
    }
  }

  if (row.paymentStatus === 'failed') {
    return { ...row, verdict: 'failed', message: 'החיוב נכשל, לא נגבה כסף', retryable: false }
  }

  return { ...row, verdict: 'in_flight', message: 'בתהליך תשלום', retryable: false }
}

export const VERDICT_LABELS: Record<ReconciliationVerdict, string> = {
  settled: 'תקין',
  unfinalized: 'כסף נגבה, הזמנה פתוחה',
  in_flight: 'בתהליך',
  failed: 'נכשל',
  refunded: 'הוחזר',
  paid_without_charge: 'נסגר בלי חיוב',
}

export interface ReconciliationSummary {
  total: number
  settled: number
  /** The count that should be zero. */
  unfinalized: number
  inFlight: number
  failed: number
  refunded: number
  paidWithoutCharge: number
  /** Money charged and not closed, in shekels. */
  strandedIls: number
}

export function summarize(rows: readonly Reconciled[]): ReconciliationSummary {
  const summary: ReconciliationSummary = {
    total: rows.length,
    settled: 0,
    unfinalized: 0,
    inFlight: 0,
    failed: 0,
    refunded: 0,
    paidWithoutCharge: 0,
    strandedIls: 0,
  }
  for (const row of rows) {
    if (row.verdict === 'settled') summary.settled += 1
    else if (row.verdict === 'in_flight') summary.inFlight += 1
    else if (row.verdict === 'failed') summary.failed += 1
    else if (row.verdict === 'refunded') summary.refunded += 1
    else if (row.verdict === 'paid_without_charge') summary.paidWithoutCharge += 1
    else if (row.verdict === 'unfinalized') {
      summary.unfinalized += 1
      summary.strandedIls += row.amountIls ?? 0
    }
  }
  summary.strandedIls = Math.round(summary.strandedIls * 100) / 100
  return summary
}

/** The rows worth acting on, worst first. */
export function needsAttention(rows: readonly Reconciled[]): Reconciled[] {
  const rank: Record<ReconciliationVerdict, number> = {
    unfinalized: 0,
    paid_without_charge: 1,
    in_flight: 2,
    failed: 3,
    refunded: 4,
    settled: 5,
  }
  return rows
    .filter((r) => r.verdict === 'unfinalized' || r.verdict === 'paid_without_charge')
    .sort((a, b) => rank[a.verdict] - rank[b.verdict])
}
