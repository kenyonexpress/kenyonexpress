import { sendGaEvent } from '@/lib/analytics/server-events'
import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { identityScopedClient } from '@/lib/supabase/bearer'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { expireWalletPasses } from '@/lib/wallet/notify'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { verifyVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { readScanContext, recordRefusedScan } from '@/server/domain/vouchers/scan-context'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Supplier-side voucher redemption. The atomic work happens in the
 * public.redeem_voucher() RPC (051), which is SECURITY DEFINER and derives the
 * supplier from supplier_members using auth.uid(). This route is a thin adapter:
 * it verifies the QR signature before the DB is touched, resolves the short
 * code, and translates the RPC outcome into an HTTP status and a Hebrew message.
 *
 * The RPC is called through the user-scoped server client (not the service
 * role) so auth.uid() is populated inside the function. Never pass the supplier
 * id or the code's supplier from the request; the RPC ignores anything but the
 * caller's own membership.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md sections 4, 7.1.
 */

const redeemRequestSchema = z
  .object({
    code: z.string().trim().max(64).optional(),
    qr_payload: z.string().trim().max(2048).optional(),
    method: z.enum(['camera', 'manual']).optional(),
    // Docs / offline drain name this scan_method; accept either.
    scan_method: z.enum(['camera', 'manual']).optional(),
    idempotency_key: z.string().trim().min(8).max(128).optional(),
    /** Who was at the till. Attribution only; it grants nothing. See 115. */
    staff_id: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.code || data.qr_payload), {
    message: 'code or qr_payload required',
  })
  .transform((data) => ({
    ...data,
    method: (data.method ?? data.scan_method ?? 'manual') as 'camera' | 'manual',
  }))

type Outcome =
  | 'success'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'not_found'
  | 'invalid_request'
  | 'unauthorized'
  | 'rate_limited'

const OUTCOME_MESSAGES: Record<Outcome, string> = {
  success: 'השובר מומש בהצלחה',
  already_redeemed: 'השובר כבר מומש',
  expired: 'תוקף השובר פג',
  cancelled: 'השובר בוטל',
  refunded: 'השובר הוחזר ללקוח',
  not_found: 'קוד שובר לא נמצא',
  invalid_request: 'בקשה לא תקינה',
  unauthorized: 'אין הרשאת ספק',
  rate_limited: 'יותר מדי סריקות, המתן רגע',
}

const HTTP_STATUS: Record<Outcome, number> = {
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

type VoucherDetail = {
  code: string | null
  product_name: string | null
  customer_name: string | null
  face_value_agorot: number | null
  coupon_price_agorot: number | null
  remaining_amount_due_agorot: number | null
  redeemed_at: string | null
}

type RedeemResponse = {
  outcome: Outcome
  message: string
  replayed?: boolean
  voucher?: VoucherDetail
  expires_at?: string | null
  redeemed_at?: string | null
}

function respond(body: RedeemResponse, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

function asOutcome(value: unknown): Outcome {
  const known: Outcome[] = [
    'success',
    'already_redeemed',
    'expired',
    'cancelled',
    'refunded',
    'not_found',
    'invalid_request',
    'unauthorized',
    'rate_limited',
  ]
  return known.includes(value as Outcome) ? (value as Outcome) : 'not_found'
}

/**
 * Writes `voucher_redemptions.staff_id` for the row the RPC just created.
 *
 * The admin client, because the supplier's own RLS on that table is read-only
 * and must stay that way: a till that could UPDATE its scan log could rewrite
 * who performed a redemption after the fact, which is the one thing an audit
 * trail exists to prevent. This narrow, server-side stamp is the only writer.
 *
 * The staff row is re-checked against the caller's supplier here rather than
 * trusted from the body, so a member cannot attribute their scan to a person at
 * another business.
 */
async function stampStaff(idempotencyKey: string, staffId: string, userId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: staff } = await admin
    .from('supplier_staff')
    .select('id, supplier_id')
    .eq('id', staffId)
    .maybeSingle()
  if (!staff) return

  const { data: membership } = await admin
    .from('supplier_members')
    .select('supplier_id')
    .eq('user_id', userId)
    .eq('supplier_id', staff.supplier_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!membership) return

  const { error } = await admin
    .from('voucher_redemptions')
    .update({ staff_id: staffId })
    .eq('idempotency_key', idempotencyKey)
  if (error) log.warn('voucher.staff_stamp_failed', { reason: error.message })
}

/**
 * The redemption event, for GA4 only. Never throws and never blocks: the
 * voucher is already burned by the time this runs.
 */
async function reportRedemption(result: Record<string, unknown>): Promise<void> {
  try {
    const paid = Number(result.coupon_price_agorot ?? 0)
    if (!Number.isFinite(paid) || paid <= 0) return
    await sendGaEvent('redeem_coupon', {
      items: [
        {
          id: String(result.product_id ?? result.code ?? 'voucher'),
          name: String(result.product_name ?? 'קופון'),
          priceAgorot: Math.round(paid),
          quantity: 1,
        },
      ],
      valueAgorot: Math.round(paid),
      transactionId: String(result.code ?? ''),
    })
  } catch (error) {
    log.warn('analytics.redeem_event_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const scanContext = readScanContext(request.headers)

  // Cookie for the web portal, bearer for the app, and in BOTH cases a client
  // that carries the caller's identity into Postgres. `redeem_voucher` derives
  // the supplier from the caller's own `supplier_members` row through
  // `auth.uid()`, so the service-role client would have no identity at all and
  // every scan would be refused as unauthorized.
  const scoped = await identityScopedClient(request)
  if (!scoped) {
    return respond({ outcome: 'unauthorized', message: OUTCOME_MESSAGES.unauthorized }, 401)
  }
  const { client: supabase, identity } = scoped
  const user = identity.user

  // The lookup route next door has had a ceiling since it was written, and this
  // one did not — which made the ceiling decorative. An attacker walking the
  // code space would use whichever endpoint is not limited, and this is the one
  // that BURNS the voucher rather than describing it. It is also the one whose
  // effect cannot be undone.
  //
  // Tighter than lookup's 300 because of that asymmetry, and still far above a
  // real till: 120 redemptions an hour from one member is a scan every thirty
  // seconds, without pause, for an hour. `checkRateLimit` fails open, which is
  // the right direction with a customer waiting at the counter.
  const allowed = await checkRateLimit(`voucher-redeem:${user.id}`, 120, 3600)
  if (!allowed) {
    return respond({ outcome: 'rate_limited', message: OUTCOME_MESSAGES.rate_limited }, 429)
  }

  const parsed = redeemRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return respond({ outcome: 'invalid_request', message: OUTCOME_MESSAGES.invalid_request }, 400)
  }

  const { qr_payload, code, method, idempotency_key, staff_id } = parsed.data

  // Resolve the short code. A QR payload must pass the HMAC check first; a bad
  // signature never reaches redeem_voucher and is logged as invalid_signature.
  let shortCode: string | null = null
  if (qr_payload) {
    const verified = verifyVoucherQrPayload(qr_payload)
    if (!verified) {
      await recordRefusedScan({
        codeEntered: normalizeVoucherCode(code ?? ''),
        outcome: 'invalid_signature',
        scanMethod: method,
        context: scanContext,
        client: supabase,
      })
      return respond({ outcome: 'not_found', message: OUTCOME_MESSAGES.not_found }, 404)
    }
    shortCode = normalizeVoucherCode(verified.c)
  } else if (code) {
    shortCode = normalizeVoucherCode(code)
  }

  if (!shortCode) {
    return respond({ outcome: 'not_found', message: OUTCOME_MESSAGES.not_found }, 404)
  }

  const { data, error } = await supabase.rpc('redeem_voucher', {
    p_code: shortCode,
    p_scan_method: method,
    p_idempotency_key: idempotency_key ?? null,
    p_ip: scanContext.ip,
    p_user_agent: scanContext.userAgent,
  })

  if (error) {
    // The RPC only raises on infrastructure failure; a redemption refusal is a
    // normal jsonb result, not an error.
    log.error('voucher.redeem_rpc_failed', { reason: error.message })
    // The customer is standing at the counter with a voucher the platform
    // cannot decide about. Under the no-Escrow model a scan does not move
    // money on our ledger; it only burns the voucher.
    capturePaymentError(new Error(error.message), {
      stage: 'redeem_voucher_rpc',
      detail: { code: error.code, scan_method: method },
    })
    return respond({ outcome: 'invalid_request', message: 'שגיאת מערכת, נסה שוב' }, 500)
  }

  const result = (data ?? {}) as Record<string, unknown>
  const outcome = asOutcome(result.outcome)
  const status = HTTP_STATUS[outcome]
  const replayed = result.replayed === true

  if (outcome === 'success') {
    // The voucher is already burned in the database. Awaited rather than fired
    // and forgotten, because a serverless invocation can be frozen the moment
    // the response is returned and the push would never leave. It cannot throw
    // and it cannot change the answer; a replay skips it, since the pass was
    // expired the first time round.
    if (!replayed) {
      await expireWalletPasses([(result.code as string) ?? shortCode])
    }

    // Attribution is stamped AFTER the atomic redeem, not inside it, and the
    // ordering is the point: `redeem_voucher` is the money-path RPC and adding
    // an argument to it to carry a display concern would put a bookkeeping
    // column on the same failure path as burning the voucher. So a failure here
    // loses the cashier's name and nothing else - which is why a null
    // `staff_id` must never be read as "the redemption did not happen".
    if (staff_id && idempotency_key) {
      await stampStaff(idempotency_key, staff_id, user.id)
    }

    // A redemption is a funnel step worth measuring - it is the moment a coupon
    // becomes a visit to a business - and it is reported to GA4 ONLY.
    //
    // Meta gets nothing, deliberately: the money moved when the coupon was
    // bought, weeks earlier, and reporting the redemption as a Purchase would
    // double-count revenue in the platform that sets ad spend against it.
    // `metaEventFor('redeem_coupon')` returns null for exactly this reason.
    //
    // Value is what the customer PAID for the coupon, not its face value: face
    // value is the business's list price and was never our revenue.
    if (!replayed) {
      await reportRedemption(result)
    }

    return respond(
      {
        outcome,
        message: OUTCOME_MESSAGES.success,
        replayed,
        voucher: {
          code: (result.code as string) ?? shortCode,
          product_name: (result.product_name as string) ?? null,
          customer_name: (result.customer_name as string) ?? null,
          face_value_agorot: (result.face_value_agorot as number) ?? null,
          coupon_price_agorot: (result.coupon_price_agorot as number) ?? null,
          remaining_amount_due_agorot: (result.remaining_amount_due_agorot as number) ?? null,
          redeemed_at: (result.redeemed_at as string) ?? null,
        },
      },
      status,
    )
  }

  return respond(
    {
      outcome,
      message: OUTCOME_MESSAGES[outcome],
      replayed,
      expires_at: (result.expires_at as string) ?? null,
      redeemed_at: (result.redeemed_at as string) ?? null,
    },
    status,
  )
}

export const POST = withRequestLog('/api/supplier/vouchers/redeem', handlePOST)
