import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly voucher lifecycle job. Two steps, in this order and never merged:
 *
 *   1. `expire_vouchers()` flips `issued` rows past `expires_at` to `expired`
 *      and refunds the supplier's escrow hold.
 *   2. `credit_expired_vouchers()` credits the customer's wallet with what they
 *      paid online for each expired voucher (C6: expiry is not forfeiture).
 *
 * Step 2 is separate in the database for a reason, and the split is preserved
 * here: it moves money and step 1 does not. If the credit fails, the statuses
 * from step 1 are still correct and the credit retries on the next run, keyed
 * `voucher:<id>:expiry_credit` so it can only ever land once. That is also why
 * a failing step 2 does not undo step 1 - it reports and lets the next run
 * pick the vouchers back up.
 *
 * Neither RPC takes arguments. `expire_vouchers()` sweeps every due row;
 * `credit_expired_vouchers()` caps itself at 500 per call, so a large backlog
 * drains over consecutive runs rather than in one long transaction.
 *
 * Scan-time safety never depends on this job: `redeem_voucher()` re-checks
 * expiry inside its atomic UPDATE. What this job buys is truthful statuses on
 * the customer page and, more importantly, the two money legs an unscanned
 * expired voucher owes.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: expired, error: expireError } = await admin.rpc('expire_vouchers')
  if (expireError) {
    log.error('vouchers.expire_failed', { reason: expireError.message })
    return NextResponse.json({ ok: false, error: expireError.message }, { status: 500 })
  }

  const { data: credited, error: creditError } = await admin.rpc('credit_expired_vouchers')
  if (creditError) {
    // The sweep already committed. Say so, so a 500 here is not read as
    // "nothing happened" and the vouchers are not swept a second time.
    log.error('vouchers.expiry_credit_failed', { reason: creditError.message, expired })
    return NextResponse.json(
      { ok: false, expired, credited: 0, error: creditError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, expired, credited })
}

export const GET = withRequestLog('/api/cron/expire-vouchers', handleGET)
