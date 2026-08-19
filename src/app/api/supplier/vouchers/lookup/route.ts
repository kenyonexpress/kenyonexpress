import { withRequestLog } from '@/lib/observability/with-request-log'
import { identityScopedClient } from '@/lib/supabase/bearer'
import { getSupplierMemberships } from '@/lib/supplier/rbac'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { verifyVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { toPublicOutcome, validateVoucherRedemption } from '@/server/domain/vouchers/redemption'
import { readScanContext, recordRefusedScan } from '@/server/domain/vouchers/scan-context'
import { getVoucherForRedemption } from '@/server/queries/vouchers'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Read-only verification of a scanned voucher, for the confirm step of /scan.
 *
 * WHY IT EXISTS. The scan screen used to confirm against nothing but the code
 * the cashier had just typed, so the first time the platform said anything
 * about the voucher was after redeem_voucher() had already burned it. A wrong
 * code was found out one keystroke too late, and redemption is not reversible.
 * This route answers "what is this, and will it redeem" before that.
 *
 * WHAT IT IS NOT. It decides nothing and it writes nothing to the voucher.
 * redeem_voucher() re-derives the supplier from supplier_members and re-checks
 * status and expiry inside the transaction that flips the row, so a stale or
 * generous answer here cannot cause a redemption the RPC would refuse. Treat
 * every field below as a display value.
 *
 * Refusals that never reach a voucher are still recorded: a forged QR is the
 * attempt most worth having on record, and it is logged here exactly as the
 * redeem route logs it.
 */

const lookupSchema = z
  .object({
    code: z.string().trim().max(64).optional(),
    qr_payload: z.string().trim().max(2048).optional(),
    method: z.enum(['camera', 'manual']).default('manual'),
  })
  .refine((data) => Boolean(data.code || data.qr_payload), {
    message: 'code or qr_payload required',
  })

type LookupOutcome =
  | 'redeemable'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'not_found'
  | 'invalid_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable'

const MESSAGES: Record<LookupOutcome, string> = {
  redeemable: 'השובר תקף, אפשר לממש',
  already_redeemed: 'השובר כבר מומש',
  expired: 'תוקף השובר פג',
  cancelled: 'השובר בוטל',
  refunded: 'השובר הוחזר ללקוח',
  not_found: 'קוד שובר לא נמצא',
  invalid_request: 'בקשה לא תקינה',
  unauthorized: 'אין הרשאת ספק',
  rate_limited: 'יותר מדי בדיקות, המתן רגע',
  unavailable: 'לא ניתן לבדוק את השובר כרגע, נסו שוב בעוד רגע',
}

const HTTP_STATUS: Record<LookupOutcome, number> = {
  redeemable: 200,
  already_redeemed: 200,
  expired: 200,
  cancelled: 200,
  refunded: 200,
  not_found: 404,
  invalid_request: 400,
  unauthorized: 401,
  rate_limited: 429,
  unavailable: 503,
}

export interface LookupResponse {
  outcome: LookupOutcome
  message: string
  voucher?: {
    code: string
    status: string
    product_name: string | null
    customer_name: string | null
    face_value_agorot: number
    coupon_price_agorot: number
    remaining_amount_due_agorot: number
    expires_at: string
    redeemed_at: string | null
  }
}

function respond(body: LookupResponse, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const scanContext = readScanContext(request.headers)

  // Cookie for the portal, bearer for the app, and either way a client that
  // carries the caller into Postgres: the lookup is scoped by the same
  // membership the redemption is.
  const scoped = await identityScopedClient(request)
  if (!scoped) return respond({ outcome: 'unauthorized', message: MESSAGES.unauthorized }, 401)
  const { client: supabase, identity } = scoped
  const user = identity.user

  // A lookup is cheap and reversible, so the ceiling is generous; it exists
  // because a member with a session could otherwise walk the code space of
  // their own supplier's vouchers at machine speed. checkRateLimit fails open,
  // which is the right direction at a till.
  const allowed = await checkRateLimit(`voucher-lookup:${user.id}`, 300, 3600)
  if (!allowed) return respond({ outcome: 'rate_limited', message: MESSAGES.rate_limited }, 429)

  const parsed = lookupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return respond({ outcome: 'invalid_request', message: MESSAGES.invalid_request }, 400)
  }

  const { code, qr_payload, method } = parsed.data

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
      return respond({ outcome: 'not_found', message: MESSAGES.not_found }, 404)
    }
    shortCode = normalizeVoucherCode(verified.c)
  } else if (code) {
    shortCode = normalizeVoucherCode(code)
  }

  if (!shortCode) return respond({ outcome: 'not_found', message: MESSAGES.not_found }, 404)

  const supplierIds = await getSupplierMemberships()

  // A READ THAT FAILED IS NOT A VOUCHER THAT DOES NOT EXIST. The query throws
  // on a failed read rather than returning the same null another supplier's
  // voucher returns, because both answers below are wrong for it: the customer
  // at the till has already paid, and `recordRefusedScan` would write a row
  // saying the code does not exist for a lookup that never happened - into the
  // log that exists so a disputed scan can be reconstructed. The throw is
  // already logged, once, by the query.
  let voucher: Awaited<ReturnType<typeof getVoucherForRedemption>>
  try {
    voucher = await getVoucherForRedemption(shortCode, supplierIds)
  } catch {
    return respond({ outcome: 'unavailable', message: MESSAGES.unavailable }, 503)
  }

  if (!voucher) {
    // Another supplier's voucher and a code that does not exist answer the
    // same way, which is the collapse redeem_voucher() performs too.
    await recordRefusedScan({
      codeEntered: shortCode,
      outcome: 'not_found',
      scanMethod: method,
      context: scanContext,
      client: supabase,
    })
    return respond({ outcome: 'not_found', message: MESSAGES.not_found }, 404)
  }

  const verdict = toPublicOutcome(
    validateVoucherRedemption({
      voucher: {
        code: voucher.code,
        status: voucher.status,
        supplierId: voucher.supplierId,
        expiresAt: voucher.expiresAt,
        faceValueAgorot: voucher.faceValueAgorot,
        couponPriceAgorot: voucher.couponPriceAgorot,
        remainingAmountDueAgorot: voucher.remainingAmountDueAgorot,
      },
      // Ownership was already decided by getVoucherForRedemption against the
      // caller's full membership set. Passing the voucher's own supplier keeps
      // this call to the status and expiry question it is being asked here.
      requestingSupplierId: voucher.supplierId,
      now: new Date(),
    }),
  )

  const outcome: LookupOutcome = verdict === 'success' ? 'redeemable' : verdict

  return respond(
    {
      outcome,
      message: MESSAGES[outcome],
      voucher: {
        code: voucher.code,
        status: voucher.status,
        product_name: voucher.productName,
        customer_name: voucher.customerName,
        face_value_agorot: voucher.faceValueAgorot,
        coupon_price_agorot: voucher.couponPriceAgorot,
        remaining_amount_due_agorot: voucher.remainingAmountDueAgorot,
        expires_at: voucher.expiresAt,
        redeemed_at: voucher.redeemedAt,
      },
    },
    HTTP_STATUS[outcome],
  )
}

export const POST = withRequestLog('/api/supplier/vouchers/lookup', handlePOST)
