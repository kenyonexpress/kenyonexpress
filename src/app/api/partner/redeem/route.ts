import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { isSameOriginRequest } from '@/lib/security/same-origin'
import { createAdminClient } from '@/lib/supabase/admin'
import { identityScopedClient } from '@/lib/supabase/bearer'
import { parsePartnerInput } from '@/lib/vouchers/partner-input'
import { expireWalletPasses } from '@/lib/wallet/notify'
import { trackServerEvent } from '@/server/analytics/track'
import {
  type PartnerRedeemOutcome,
  redeemForPartner,
} from '@/server/domain/vouchers/partner-redeem'
import { readScanContext } from '@/server/domain/vouchers/scan-context'
import { recordRedemptionSignals } from '@/server/fraud/redemption-signals'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * POST /api/partner/redeem: the endpoint behind /partner/redeem (S15).
 *
 * Takes one free-text field, whatever the partner scanned or typed (signed QR,
 * redeem URL, 10-symbol code or 8-digit pin), plus an idempotency key that is
 * REQUIRED here, unlike the older supplier route. The page mints one key per
 * submit and reuses it when it retries after a network failure, so a till that
 * lost the response gets the first answer back (`replayed: true`) instead of
 * "already redeemed" for a coupon it just burned.
 *
 * The rate-limit bucket is the supplier route's `voucher-redeem`, on purpose:
 * two endpoints that burn the same vouchers must share one ceiling, or walking
 * the pin space just moves to whichever door is not counted.
 *
 * The work is in src/server/domain/vouchers/partner-redeem.ts.
 */

const bodySchema = z.object({
  input: z.string().trim().min(1).max(2048),
  idempotency_key: z.string().trim().min(8).max(128),
  method: z.enum(['camera', 'manual']).default('manual'),
})

const MESSAGES: Record<PartnerRedeemOutcome, string> = {
  success: 'הקופון מומש בהצלחה',
  already_redeemed: 'הקופון כבר מומש',
  expired: 'תוקף הקופון פג',
  cancelled: 'הקופון בוטל',
  refunded: 'הקופון הוחזר ללקוח',
  not_found: 'הקופון לא נמצא בבית העסק שלכם',
  invalid_request: 'יש לסרוק QR או להקליד קוד בן 8 ספרות',
  unauthorized: 'אין הרשאת שותף',
  rate_limited: 'יותר מדי ניסיונות, המתינו רגע',
}

const STATUS: Record<PartnerRedeemOutcome, number> = {
  success: 200,
  already_redeemed: 409,
  expired: 409,
  cancelled: 409,
  refunded: 409,
  not_found: 404,
  invalid_request: 400,
  unauthorized: 401,
  rate_limited: 429,
}

function reply(
  outcome: PartnerRedeemOutcome,
  extra: Record<string, unknown> = {},
  headers?: Headers,
) {
  return NextResponse.json(
    { outcome, message: MESSAGES[outcome], ...extra },
    { status: STATUS[outcome], headers },
  )
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) return reply('unauthorized')

  const scoped = await identityScopedClient(request)
  if (!scoped) return reply('unauthorized')
  const userId = scoped.identity.user.id

  const decision = await rateLimit('voucher-redeem', userId)
  if (!decision.allowed) return reply('rate_limited', {}, rateLimitHeaders(decision))

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply('invalid_request')

  const context = readScanContext(request.headers)
  const admin = createAdminClient()

  let result: Awaited<ReturnType<typeof redeemForPartner>>
  try {
    result = await redeemForPartner({
      scoped: scoped.client,
      admin,
      userId,
      input: parsePartnerInput(parsed.data.input),
      scanMethod: parsed.data.method,
      idempotencyKey: parsed.data.idempotency_key,
      context,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.error('partner.redeem_failed', { reason })
    capturePaymentError(error instanceof Error ? error : new Error(reason), {
      stage: 'partner_redeem',
      detail: { method: parsed.data.method },
    })
    return NextResponse.json(
      { outcome: 'invalid_request', message: 'שגיאת מערכת, נסו שוב' },
      { status: 500 },
    )
  }

  const { outcome, replayed, raw, code, inputKind } = result

  // A replay wrote no new burn, so nothing downstream runs twice for it.
  if (inputKind && !replayed) {
    await recordRedemptionSignals(admin, { userId, ip: context.ip, now: new Date() })
  }
  if (outcome === 'success' && !replayed && code) {
    await expireWalletPasses([code])
    await trackServerEvent({ eventName: 'voucher_redeemed', userId, props: { code } })
  }

  if (outcome === 'success') {
    return reply('success', {
      replayed,
      input_kind: inputKind,
      voucher: {
        code,
        product_name: (raw.product_name as string) ?? null,
        customer_name: (raw.customer_name as string) ?? null,
        face_value_agorot: (raw.face_value_agorot as number) ?? null,
        coupon_price_agorot: (raw.coupon_price_agorot as number) ?? null,
        remaining_amount_due_agorot: (raw.remaining_amount_due_agorot as number) ?? null,
        redeemed_at: (raw.redeemed_at as string) ?? null,
      },
    })
  }
  return reply(outcome, {
    replayed,
    input_kind: inputKind,
    redeemed_at: (raw.redeemed_at as string) ?? null,
    expires_at: (raw.expires_at as string) ?? null,
  })
}

export const POST = withRequestLog('/api/partner/redeem', handlePOST)
