import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import {
  type RedemptionOutcome,
  isValidShortCode,
  validateRedemption,
  verifyQrPayload,
} from '@/server/domain/orders/redemption'
import type { Json } from '@/types/database'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const redeemRequestSchema = z
  .object({
    code: z.string().trim().optional(),
    qr_payload: z.string().trim().optional(),
    method: z.enum(['camera', 'manual']).default('manual'),
  })
  .refine((data) => Boolean(data.code || data.qr_payload), {
    message: 'code or qr_payload required',
  })

const OUTCOME_MESSAGES: Record<RedemptionOutcome, string> = {
  success: 'השובר מומש בהצלחה',
  not_found: 'קוד שובר לא נמצא',
  already_used: 'השובר כבר מומש',
  expired: 'תוקף השובר פג',
  refunded: 'השובר בוטל והוחזר',
  wrong_supplier: 'השובר אינו שייך לעסק זה',
}

type RedeemResponse = {
  outcome: RedemptionOutcome | 'unauthorized' | 'rate_limited' | 'invalid_request'
  message: string
  coupon?: {
    code: string
    face_value_ils: number | null
    collect_amount_ils: number | null
    product_name: string | null
  }
}

function respond(body: RedeemResponse, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

async function resolveSupplierId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: member } = await admin
    .from('supplier_members')
    .select('supplier_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (member?.supplier_id) return member.supplier_id
  const { data: profile } = await admin
    .from('profiles')
    .select('supplier_id')
    .eq('id', userId)
    .maybeSingle()
  return profile?.supplier_id ?? null
}

/**
 * Supplier-side voucher validation + redemption.
 * Single use is enforced twice: domain validation on the read snapshot, and the
 * UNIQUE(coupon_code_id) constraint on coupon_redemptions under concurrency.
 * Escrow release is keyed per coupon code and moves money exactly once.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return respond({ outcome: 'unauthorized', message: 'נדרשת התחברות ספק' }, 401)
  }

  const supplierId = await resolveSupplierId(user.id)
  if (!supplierId) {
    return respond({ outcome: 'unauthorized', message: 'המשתמש אינו משויך לספק' }, 403)
  }

  const allowed = await checkRateLimit(`redeem:supplier:${supplierId}`, 60, 60)
  if (!allowed) {
    return respond({ outcome: 'rate_limited', message: 'יותר מדי סריקות, המתינו רגע' }, 429)
  }

  const parsed = redeemRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return respond({ outcome: 'invalid_request', message: 'בקשה לא תקינה' }, 400)
  }

  // Resolve the short code: direct, or out of a verified QR payload
  let shortCode: string | null = null
  if (parsed.data.qr_payload) {
    const qr = verifyQrPayload(parsed.data.qr_payload)
    if (!qr) {
      return respond({ outcome: 'not_found', message: OUTCOME_MESSAGES.not_found }, 404)
    }
    shortCode = qr.code
  } else if (parsed.data.code && isValidShortCode(parsed.data.code)) {
    shortCode = parsed.data.code
  }
  if (!shortCode) {
    return respond({ outcome: 'not_found', message: OUTCOME_MESSAGES.not_found }, 404)
  }

  const admin = createAdminClient()
  const now = new Date()

  const { data: coupon } = await admin
    .from('coupon_codes')
    .select(
      'id, code, status, supplier_id, expires_at, order_item_id, face_value_ils, collect_amount_ils, product_id',
    )
    .eq('code', shortCode)
    .maybeSingle()

  const outcome = validateRedemption({
    coupon: coupon
      ? {
          code: coupon.code,
          status: coupon.status,
          supplierId: coupon.supplier_id ?? '',
          expiresAt: coupon.expires_at ?? new Date(0).toISOString(),
        }
      : null,
    requestingSupplierId: supplierId,
    now,
  })

  // Scan audit trail, success or not
  const logScan = (scanResult: string) =>
    admin.from('coupon_scan_events').insert({
      coupon_code_id: coupon?.id ?? null,
      supplier_id: supplierId,
      scanned_by: user.id,
      scan_result: scanResult,
      method: parsed.data.method,
      payload: { code: shortCode } as unknown as Json,
    })

  if (outcome !== 'success' || !coupon) {
    await logScan(outcome)
    const status = outcome === 'not_found' ? 404 : 409
    return respond({ outcome, message: OUTCOME_MESSAGES[outcome] }, status)
  }

  // Single-use arbiter: UNIQUE(coupon_code_id). A concurrent double scan loses here.
  const { error: redemptionError } = await admin.from('coupon_redemptions').insert({
    coupon_code_id: coupon.id,
    order_item_id: coupon.order_item_id,
    supplier_id: supplierId,
    scanned_by: user.id,
    method: parsed.data.method,
    amount_collected_ils: coupon.collect_amount_ils,
  })
  if (redemptionError) {
    await logScan('already_used')
    return respond({ outcome: 'already_used', message: OUTCOME_MESSAGES.already_used }, 409)
  }

  await admin
    .from('coupon_codes')
    .update({
      status: 'used',
      used_at: now.toISOString(),
      used_by_supplier_user_id: user.id,
      used_scan_method: parsed.data.method,
    })
    .eq('id', coupon.id)
    .eq('status', 'issued')

  // Escrow release: guarded UPDATE moves held -> released exactly once
  await admin
    .from('escrow_holds')
    .update({
      status: 'released',
      released_at: now.toISOString(),
      release_idempotency_key: `rel:${coupon.id}`,
    })
    .eq('coupon_code_id', coupon.id)
    .eq('status', 'held')

  // Settlement rollup for the order item: redeemed, then escrow_released
  // once every voucher of the item is released.
  if (coupon.order_item_id) {
    const { data: remaining } = await admin
      .from('escrow_holds')
      .select('id')
      .eq('order_item_id', coupon.order_item_id)
      .eq('status', 'held')
    const nextStatus = (remaining?.length ?? 0) === 0 ? 'escrow_released' : 'redeemed'
    await admin
      .from('order_items')
      .update({ settlement_status: nextStatus })
      .eq('id', coupon.order_item_id)
      .in('settlement_status', ['escrow_held', 'redeemed'])
  }

  await logScan('success')

  let productName: string | null = null
  if (coupon.product_id) {
    const { data: product } = await admin
      .from('products')
      .select('name_he')
      .eq('id', coupon.product_id)
      .maybeSingle()
    productName = product?.name_he ?? null
  }

  return respond(
    {
      outcome: 'success',
      message: OUTCOME_MESSAGES.success,
      coupon: {
        code: coupon.code,
        face_value_ils: coupon.face_value_ils,
        collect_amount_ils: coupon.collect_amount_ils,
        product_name: productName,
      },
    },
    200,
  )
}
