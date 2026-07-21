import { createHash, timingSafeEqual } from 'node:crypto'

export type CouponCodeStatus = 'issued' | 'used' | 'expired' | 'refunded'

/** Matches public.scan_result (027) minus infra-only values. */
export type RedemptionOutcome =
  | 'success'
  | 'not_found'
  | 'already_used'
  | 'expired'
  | 'refunded'
  | 'wrong_supplier'

export interface RedeemableCoupon {
  code: string
  status: CouponCodeStatus
  supplierId: string
  expiresAt: string
}

export const SHORT_CODE_PATTERN = /^\d{8}$/

export function isValidShortCode(code: string): boolean {
  return SHORT_CODE_PATTERN.test(code)
}

export interface QrPayloadParts {
  code: string
  orderItemId: string
  expiresUnix: number
  userId: string
}

/**
 * Verifies the payload produced by issueCouponCode:
 * `KE|<code>|<orderItemId>|<expiresUnix>|<userId>|<sha256-32-hex>`.
 * Returns the parsed parts only when the digest matches (constant-time compare).
 */
export function verifyQrPayload(payload: string): QrPayloadParts | null {
  const parts = payload.split('|')
  if (parts.length !== 6) return null
  const [prefix, code, orderItemId, expiresRaw, userId, digest] = parts
  if (prefix !== 'KE' || !code || !orderItemId || !expiresRaw || !userId || !digest) {
    return null
  }
  if (!isValidShortCode(code)) return null
  const expiresUnix = Number.parseInt(expiresRaw, 10)
  if (!Number.isSafeInteger(expiresUnix) || expiresUnix <= 0) return null

  const raw = `KE|${code}|${orderItemId}|${expiresUnix}|${userId}`
  const expected = createHash('sha256').update(raw).digest('hex').slice(0, 32)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(digest, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return { code, orderItemId, expiresUnix, userId }
}

/**
 * Pure single-scan gate. Persistence must additionally enforce single use with
 * a UNIQUE constraint on coupon_redemptions.coupon_code_id (the DB is the
 * final arbiter under concurrency).
 */
export function validateRedemption(input: {
  coupon: RedeemableCoupon | null
  requestingSupplierId: string
  now: Date
}): RedemptionOutcome {
  const { coupon, requestingSupplierId, now } = input
  if (!coupon) return 'not_found'
  if (coupon.supplierId !== requestingSupplierId) return 'wrong_supplier'
  if (coupon.status === 'used') return 'already_used'
  if (coupon.status === 'refunded') return 'refunded'
  if (coupon.status === 'expired') return 'expired'
  if (new Date(coupon.expiresAt).getTime() <= now.getTime()) return 'expired'
  return 'success'
}
