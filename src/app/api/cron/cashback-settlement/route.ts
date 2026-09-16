import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { settleCashback } from '@/server/cashback/settlement'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly cashback settlement: every paid order of the last thirty days is
 * checked against the two cashback legs finalize should have posted, and
 * whatever is missing is posted under the same idempotency keys.
 *
 * WHY A NIGHTLY JOB AND NOT A FIX IN FINALIZE. Finalize runs after the card
 * was charged, and both cashback calls there are deliberately "logged, never
 * thrown": failing the finalize over a bonus would leave an order charged and
 * unpaid, which is the worse incident. The price of that judgement is a gap
 * that only shows up if someone re-reads the ledger, and nobody was. This
 * job is that re-read. The rule about WHAT is owed stays where it was:
 * the item amount is the order's own snapshot, the bonus is
 * `fn_cashback_order_bonus`'s decision, and `lib/cashback/settlement.ts`
 * only decides which orders can safely be asked.
 *
 * DEFERRED IS A COUNT, NOT A FAILURE. An order that earned a bonus by rank
 * and is no longer the user's latest cannot be replayed through the RPC
 * without risking an over-award (the rank trap, documented in the lib). It
 * is logged nightly with its rank until an operator settles it through
 * `fn_cashback_admin_adjust`. The response says how many there are.
 *
 * Per-order failures answer 200 with an `errors` count, because the orders
 * that settled are settled and a retry would only no-op on them. A failed
 * read answers 500: a plan built on half the rows could defer what it should
 * have credited.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const summary = await settleCashback(createAdminClient(), new Date())
    if (summary.itemCredited > 0 || summary.bonusAwarded > 0 || summary.errors > 0) {
      // Every credit here is money finalize owed and did not post. Loud.
      log.warn('cashback.settlement_posted', { ...summary })
    } else if (summary.deferred > 0) {
      log.warn('cashback.settlement_deferred_total', { deferred: summary.deferred })
    } else {
      log.info('cashback.settlement_clean', { scanned: summary.scanned })
    }
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.error('cashback.settlement_failed', { reason })
    return NextResponse.json({ ok: false, error: reason }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/cron/cashback-settlement', handleGET)
