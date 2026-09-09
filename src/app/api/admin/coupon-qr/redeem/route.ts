import { writeAuditLog } from '@/lib/admin/audit'
import { canWriteSection } from '@/lib/admin/permissions'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { isValidUnitCode } from '@/lib/coupons/unit-codes'
import { growthClient } from '@/lib/growth/client'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Redeems one printed QR coupon code against an order: POST { code, order_id,
 * user_id?, amount_agorot? }.
 *
 * THE LOCK IS NOT HERE. The single-use guarantee lives in redeem_coupon_qr
 * (217), which takes the unit row FOR UPDATE and writes redeemed_at in the
 * same transaction as the campaign ledger row (claim_order_discount, 194).
 * This route only authenticates, validates shape, and translates the
 * function's verdict; two of these requests racing on the same flyer are
 * serialized by the database, not by anything JavaScript could promise.
 *
 * A ROUTE AND NOT A SERVER ACTION because the redeemer is not always the
 * storefront: the admin till flow and any future device at a counter POST
 * here with a session, the same reasoning as the batch PDF download next
 * door. Same guard as generating a batch (discounts, write): spending a
 * printed coupon spends the same platform money printing it committed.
 * `requireSection` is not used because it redirect()s; 403 with a body is
 * the honest answer on an API.
 *
 * amount_agorot is integer agorot (src/lib/money.ts discipline); the zod
 * gate refuses anything fractional before it can reach the ledger.
 */

const schema = z.object({
  code: z.string().trim(),
  order_id: z.string().uuid(),
  user_id: z.string().uuid().nullish(),
  amount_agorot: z.number().int().min(0).default(0),
})

/** reason -> HTTP status. Refusals a retry cannot fix are 409, absence is 404. */
function refusalStatus(reason: string): number {
  return reason === 'unknown' ? 404 : 409
}

const REASON_HE: Record<string, string> = {
  unknown: 'קוד לא מוכר',
  redeemed: 'הקוד כבר מומש בהזמנה אחרת',
  expired: 'תוקף הקוד פג',
  campaign_gone: 'הקמפיין נמחק או הועבר לארכיון',
  inactive: 'הקמפיין כבוי',
  not_started: 'הקמפיין עוד לא התחיל',
  exhausted: 'מכסת השימושים של הקמפיין נוצלה',
  per_user_exhausted: 'הלקוח כבר ניצל את המכסה שלו בקמפיין',
  no_order: 'חסר מזהה הזמנה',
}

async function handlePOST(request: NextRequest) {
  const session = await getSessionWithRole()
  if (!session || !canWriteSection(session.role, 'discounts')) {
    log.warn('coupon_qr.redeem_denied', { role: session?.role ?? null })
    return NextResponse.json({ ok: false, error: 'אין הרשאה' }, { status: 403 })
  }

  // Same policy as the voucher till and for the same reason: printed codes
  // scanned at a counter, keyed on the staff user because a shop floor is one
  // NAT address and would share an IP bucket.
  const decision = await rateLimit('voucher-redeem', session.userId)
  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: 'יותר מדי ניסיונות, נסו שוב מעט מאוחר יותר' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'בקשה לא תקינה', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const input = parsed.data

  // The Luhn gate runs before the database is asked, same as /c/[code]: a
  // mistyped digit fails here with a message, not as a phantom 'unknown'.
  if (!isValidUnitCode(input.code)) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_code', error: 'קוד לא תקין' },
      {
        status: 422,
      },
    )
  }

  const { data: result, error } = await growthClient()
    .qrRedemption()
    .redeem({
      code: input.code,
      orderId: input.order_id,
      userId: input.user_id ?? null,
      amountAgorot: input.amount_agorot,
    })
  if (error || !result) {
    log.error('coupon_qr.redeem_failed', { reason: error?.message ?? 'empty result' })
    return NextResponse.json({ ok: false, error: 'המימוש נכשל' }, { status: 500 })
  }

  if (!result.ok) {
    const reason = result.reason ?? 'unknown'
    return NextResponse.json(
      { ok: false, reason, error: REASON_HE[reason] ?? 'המימוש נדחה' },
      { status: refusalStatus(reason) },
    )
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'coupon_qr_codes',
    entityId: input.code,
    changes: {
      state: 'redeemed',
      order_id: input.order_id,
      user_id: input.user_id ?? null,
      amount_agorot: input.amount_agorot,
      campaign_id: result.campaign_id ?? null,
      replay: result.reason === 'already_claimed',
    },
  })

  return NextResponse.json({
    ok: true,
    campaign_id: result.campaign_id ?? null,
    amount_agorot: result.amount_agorot ?? input.amount_agorot,
    replay: result.reason === 'already_claimed',
  })
}

export const POST = withRequestLog('/api/admin/coupon-qr/redeem', handlePOST)
