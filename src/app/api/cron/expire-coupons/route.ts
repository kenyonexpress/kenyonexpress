import { growthClient } from '@/lib/growth/client'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly QR coupon sweep: one RPC, expire_coupon_qr_codes() (217), which
 * stamps expired_at on unredeemed codes past their own expires_at or whose
 * campaign ended or was archived.
 *
 * It moves no money and grants nothing, which is why it is one step where
 * expire-vouchers needs three: a dead flyer owes nobody a wallet credit.
 * Redemption-time safety never depends on this job either, the same division
 * as redeem_voucher: redeem_coupon_qr re-checks expiry inside its own lock,
 * and the cart lookup (byUnitCode) filters expiry on read. What the sweep
 * buys is truthful batch inventory in the admin, so unspent minus expired is
 * a count someone can plan a reprint from.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, checked in
 * constant time. Unset secret stays closed rather than opening.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const { data: expired, error } = await growthClient().qrRedemption().expireDue()
  if (error) {
    log.error('coupon_qr.expire_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  log.info('coupon_qr.expired', { expired: expired ?? 0 })
  return NextResponse.json({ ok: true, expired: expired ?? 0 })
}

export const GET = withRequestLog('/api/cron/expire-coupons', handleGET)
