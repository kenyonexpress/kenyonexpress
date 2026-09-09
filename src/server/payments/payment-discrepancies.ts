import { log } from '@/lib/observability/log'
import type { Discrepancy } from '@/lib/payments/terminal-reconciliation'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The findings of the terminal reconciliation, written down.
 *
 * WHY THIS EXISTS. `/api/cron/reconcile` pulls each terminal's transaction list,
 * diffs it against `payments`, and then keeps none of it. The admin alert is
 * capped at twenty rows -- correctly, an alert listing two hundred rows is an
 * alert nobody reads -- and the rest lives only in the HTTP response body,
 * whose caller is a scheduler that discards it. `reconcile.gaps_found` logs a
 * COUNT. So the number of problems survived and the identity of the
 * transactions did not, which is the half anyone would need to act.
 *
 * `missing_remotely` was worse off still: it is deliberately outside the
 * critical set, so it was neither alerted nor logged individually nor stored.
 * Keeping it out of the pager is right -- the terminal parser has never been
 * confirmed against a live wire format, and that kind is where a parser
 * mismatch would land, so paging on it would page on our own uncertainty.
 * Keeping no record of it is a different decision, and it threw away the exact
 * evidence that would settle the parser question on the first live run.
 *
 * IDEMPOTENT BY IDENTITY, NOT BY RUN. The reconciliation window is 48 hours and
 * runs overlap on purpose, so the same discrepancy is found on consecutive
 * days. The unique key is `(kind, transaction_id, cardcom_account_id)` and a
 * re-find bumps `last_seen_at` and `seen_count`. One problem stays one row.
 *
 * That also gives the thing a per-run table cannot: a discrepancy that STOPPED
 * being found is a row whose `last_seen_at` is older than the last run. In a
 * per-run table the same fact is an absence of new rows, and an absence is also
 * what a cron that silently stopped running looks like.
 *
 * FAILURE HERE NEVER FAILS THE JOB. Recording is not the job; asking the
 * terminal is. A write that cannot land must not turn a successful
 * reconciliation into a 500 that the scheduler retries, because the retry
 * re-pulls every terminal.
 */

/**
 * The function does not exist: the state until 191 is applied.
 *
 * `PGRST202` is PostgREST's answer for a routine that is not in the schema
 * cache, which is what an unapplied migration looks like from here. `42883` is
 * Postgres's own, which is what a cache that is stale in the other direction
 * looks like. Either one means "not applied yet"; anything else is a surprise
 * and is said every time.
 */
const NOT_APPLIED = new Set(['PGRST202', '42883'])

/** Said once per process, so an unapplied migration is not a log per run. */
let missingTableReported = false

export interface DiscrepancyRecord {
  accountId: string
  discrepancy: Discrepancy
}

export async function recordPaymentDiscrepancies(
  admin: SupabaseClient,
  records: readonly DiscrepancyRecord[],
): Promise<void> {
  if (records.length === 0) return

  // No timestamps in the payload. `first_seen_at`, `last_seen_at` and
  // `seen_count` are the function's to decide, and that is the whole reason it
  // is a function: a client that sent `first_seen_at` would reset the age of
  // every open finding on every run.
  const rows = records.map(({ accountId, discrepancy }) => ({
    kind: discrepancy.kind,
    transaction_id: discrepancy.transactionId,
    cardcom_account_id: accountId,
    terminal_agorot: discrepancy.terminalAgorot,
    local_agorot: discrepancy.localAgorot,
    order_id: discrepancy.orderId,
    payment_id: discrepancy.paymentId,
  }))

  try {
    const { error } = await admin.rpc(
      'fn_record_payment_discrepancies' as never,
      {
        p_rows: rows,
      } as never,
    )
    if (!error) return

    const notApplied = NOT_APPLIED.has(error.code ?? '')
    if (!notApplied || !missingTableReported) {
      log.error('reconcile.discrepancies_not_recorded', {
        reason: error.message,
        not_applied: notApplied,
        rows: rows.length,
      })
      if (notApplied) missingTableReported = true
    }
  } catch (error) {
    log.error('reconcile.discrepancies_not_recorded', { err: error })
  }
}

/** Test seam: the once-per-process latch is process state. */
export function resetMissingTableLatchForTest(): void {
  missingTableReported = false
}
