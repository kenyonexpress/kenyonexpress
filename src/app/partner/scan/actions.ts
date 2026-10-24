'use server'

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { verifyVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { recordRefusedScan } from '@/server/domain/vouchers/scan-context'
import { headers } from 'next/headers'

/**
 * Partner voucher redemption action.
 *
 * Validates QR signature, calls redeem_voucher() RPC which:
 * - Marks redeemed_at in vouchers table (idempotent via atomic UPDATE)
 * - Records attempt in voucher_redemptions audit table
 * - Returns success payload or error
 */

export type RedeemResult =
  | {
      success: true
      voucher: {
        code: string
        productName: string | null
        customerName: string | null
        faceValueAgorot: number
        couponPriceAgorot: number
        remainingAmountDueAgorot: number
        redeemedAt: string
      }
    }
  | {
      success: false
      error: string
      details?: string
    }

export async function redeemVoucherFromQr(qrPayload: string): Promise<RedeemResult> {
  // 1. Validate signature before touching database
  const verified = verifyVoucherQrPayload(qrPayload)

  if (!verified) {
    // Record refused scan with invalid signature
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = headersList.get('user-agent') || null

    const supabase = await createClient()
    await recordRefusedScan({
      codeEntered: '',
      outcome: 'invalid_signature',
      scanMethod: 'camera',
      context: { ip, userAgent },
      client: supabase,
    })

    return {
      success: false,
      error: 'קוד QR לא תקין',
      details: 'החתימה אינה תקפה. אנא בקשו מהלקוח לפתוח את השובר מחדש.',
    }
  }

  const shortCode = normalizeVoucherCode(verified.c)

  // 2. Get authenticated Supabase client
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: 'לא מורשה',
      details: 'נדרשת התחברות כספק.',
    }
  }

  // 3. Rate limiting: 120 redemptions per hour per user
  const allowed = await checkRateLimit(`voucher-redeem:${user.id}`, 120, 3600)
  if (!allowed) {
    return {
      success: false,
      error: 'יותר מדי סריקות',
      details: 'המתינו מעט ונסו שוב.',
    }
  }

  // 4. Per-code rate limit: 10 per hour per code
  const codeAllowed = await checkRateLimit(`voucher-redeem-code:${shortCode}`, 10, 3600)
  if (!codeAllowed) {
    return {
      success: false,
      error: 'יותר מדי ניסיונות לקוד זה',
      details: 'המתינו מעט ונסו שוב.',
    }
  }

  // 5. Call redeem_voucher() RPC - this marks redeemed_at and records in voucher_redemptions
  // The RPC is idempotent via p_idempotency_key: same key returns same result
  // Key MUST be stable across retries: user+code, NOT timestamp
  const { data, error } = await supabase.rpc('redeem_voucher', {
    p_code: shortCode,
    p_scan_method: 'camera',
    p_idempotency_key: `partner-scan:${user.id}:${shortCode}`,
  })

  if (error) {
    return {
      success: false,
      error: 'שגיאת מערכת',
      details: error.message,
    }
  }

  const result = (data ?? {}) as Record<string, unknown>
  const outcome = result.outcome as string

  // 6. Return result
  if (outcome === 'success') {
    return {
      success: true,
      voucher: {
        code: (result.code as string) ?? shortCode,
        productName: (result.product_name as string) ?? null,
        customerName: (result.customer_name as string) ?? null,
        faceValueAgorot: (result.face_value_agorot as number) ?? 0,
        couponPriceAgorot: (result.coupon_price_agorot as number) ?? 0,
        remainingAmountDueAgorot: (result.remaining_amount_due_agorot as number) ?? 0,
        redeemedAt: (result.redeemed_at as string) ?? new Date().toISOString(),
      },
    }
  }

  // Map RPC outcomes to user-friendly Hebrew messages
  const errorMessages: Record<string, { error: string; details: string }> = {
    already_redeemed: {
      error: 'השובר כבר מומש',
      details: result.redeemed_at
        ? `מומש ב-${new Date(result.redeemed_at as string).toLocaleDateString('he-IL')}`
        : 'השובר כבר נוצל.',
    },
    expired: {
      error: 'תוקף השובר פג',
      details: result.expires_at
        ? `פג תוקף ב-${new Date(result.expires_at as string).toLocaleDateString('he-IL')}`
        : 'השובר אינו בתוקף.',
    },
    cancelled: {
      error: 'השובר בוטל',
      details: 'השובר בוטל על ידי המערכת.',
    },
    refunded: {
      error: 'השובר הוחזר',
      details: 'השובר הוחזר ללקוח.',
    },
    not_found: {
      error: 'השובר לא נמצא',
      details: 'הקוד אינו משויך לבית העסק שלכם או אינו קיים.',
    },
    unauthorized: {
      error: 'אין הרשאת ספק',
      details: 'נדרשת התחברות כספק פעיל.',
    },
    rate_limited: {
      error: 'יותר מדי סריקות',
      details: 'המתינו מעט ונסו שוב.',
    },
  }

  const message = errorMessages[outcome] ?? {
    error: 'שגיאה לא ידועה',
    details: outcome,
  }

  return {
    success: false,
    ...message,
  }
}
