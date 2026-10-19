import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly voucher lifecycle job. Two steps, in this order and never merged:
 *
 *   1. `expire_vouchers()` flips `issued` rows past `expires_at` to `expired`.
 *      It moves no money. The comment here used to say it "refunds the
 *      supplier's escrow hold", which described the model Ofir reversed on
 *      2026-07-28: a coupon's whole prepayment is the platform's at payment,
 *      the supplier is due nothing from us on it, and no hold is ever written.
 *      The function in production still carries that refund block; it matches
 *      nothing, because every escrow_holds row has voucher_id NULL. 125 cut
 *      it out and IS APPLIED: read off pg_proc on 2026-09-07, neither
 *      expire_vouchers() nor credit_expired_vouchers() mentions escrow at all.
 *      The file is migrations/applied/125_expire_vouchers_no_escrow.sql. See
 *      085, which cut the identical dead branch out of redeem_voucher() and
 *      missed this one.
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
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
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

  // Step 3, added by 114, and last for the same reason step 2 is second: it
  // moves no money and it must not be able to stop the two legs that do.
  //
  // It runs AFTER the sweep on purpose. `enqueue_expiring_voucher_notices` only
  // looks at `issued` rows, so anything the sweep just expired is already out
  // of its way and nobody is reminded about a coupon that died an hour ago.
  const { data: reminders, error: reminderError } = await admin.rpc(
    'enqueue_expiring_voucher_notices',
    { p_buckets: [7, 1] },
  )
  if (reminderError) {
    // 200 IS RIGHT AND THE BARE `reminders: 0` WAS NOT.
    //
    // Answering 200 is deliberate and argued in the tests: a retry would re-run
    // two money legs to recover a mailer. But this body used to be
    // `{ ok: true, expired, credited, reminders: 0 }`, which is byte-identical
    // to a healthy run on a night when no voucher was within seven days of
    // expiry - and the suite pinned BOTH shapes to that same object, so the
    // collision was asserted rather than noticed. A cron dashboard reading this
    // JSON could not tell "nobody needed reminding" from "the reminder call
    // failed", and the T-7/T-1 notices could stop for good while every run
    // reported success.
    //
    // The leg directly above already does this correctly: the credit failure
    // returns `credited: 0` AND `error`. This now follows that convention.
    // `reminders` stays 0 rather than becoming null, because
    // "reports zero rather than null" is its own deliberate decision one test
    // below; the discriminator is added beside it, not in place of it.
    log.error('vouchers.expiry_reminders_failed', { reason: reminderError.message })
    return NextResponse.json({
      ok: true,
      expired,
      credited,
      reminders: 0,
      reminders_error: reminderError.message,
    })
  }

  return NextResponse.json({ ok: true, expired, credited, reminders: reminders ?? 0 })
}

export const GET = withRequestLog('/api/cron/expire-vouchers', handleGET)
