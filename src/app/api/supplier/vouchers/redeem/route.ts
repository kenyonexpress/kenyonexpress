import { capturePaymentError } from '@/lib/observability/sentry'
import { createClient } from '@/lib/supabase/server'
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const scanContext = readScanContext(request.headers)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return respond({ outcome: 'unauthorized', message: OUTCOME_MESSAGES.unauthorized }, 401)
  }

  const parsed = redeemRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return respond({ outcome: 'invalid_request', message: OUTCOME_MESSAGES.invalid_request }, 400)
  }

  const { qr_payload, code, method, idempotency_key } = parsed.data

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
    console.error('redeem_voucher rpc failed:', error.message)
    // The customer is standing at the counter with a voucher the platform
    // cannot decide about, and the supplier's escrow release rides on this
    // same call.
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
