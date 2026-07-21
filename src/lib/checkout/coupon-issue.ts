import { createHash, randomInt } from 'node:crypto'

export type IssuedCoupon = {
  code: string
  qrPayload: string
  expiresAt: Date
}

/**
 * Issues an 8-digit numeric coupon code + deterministic QR payload string.
 * Ed25519 signing lands with supplier portal (027); until then the payload is
 * HMAC-ready content: `KE|<code>|<orderItemId>|<expiresUnix>`.
 */
export function issueCouponCode(params: {
  orderItemId: string
  userId: string
  expiryDays: number
  now?: Date
}): IssuedCoupon {
  const now = params.now ?? new Date()
  const code = String(randomInt(0, 100_000_000)).padStart(8, '0')
  const expiresAt = new Date(now.getTime() + Math.max(1, params.expiryDays) * 24 * 60 * 60 * 1000)
  const expiresUnix = Math.floor(expiresAt.getTime() / 1000)
  const raw = `KE|${code}|${params.orderItemId}|${expiresUnix}|${params.userId}`
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 32)
  return {
    code,
    qrPayload: `${raw}|${digest}`,
    expiresAt,
  }
}
