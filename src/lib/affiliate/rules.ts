import { type Agorot, agorot, applyBp, bp } from '@/lib/money'

/** The cookie the proxy sets from `?ref=<link code>`; 30 days, server-read only. */
export const AFFILIATE_COOKIE = 'ke_aff'
export const AFFILIATE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60

/**
 * Affiliate link codes: `af` + 10 lowercase letters or digits. `?ref=` is shared
 * with the customer referral program, whose codes are exactly 8 characters
 * from an uppercase alphabet (lib/referrals/code.ts), so a 12-character
 * lowercase `af...` code can never be read as the other kind.
 */
export const LINK_CODE_RE = /^af[a-z0-9]{10}$/

export function newLinkCode(random: (n: number) => Uint8Array): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = random(10)
  let out = 'af'
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

/** Commission is never paid before the statutory cancellation window closes. */
export const SETTLEMENT_HOLD_DAYS = 14

export function isLinkCode(value: unknown): value is string {
  return typeof value === 'string' && LINK_CODE_RE.test(value)
}

/** Commission on what was paid on the site, in integer agorot, via money.ts. */
export function commissionAgorot(baseAgorot: number, commissionBp: number): Agorot {
  if (!Number.isSafeInteger(baseAgorot) || baseAgorot <= 0) return agorot(0)
  if (!Number.isInteger(commissionBp) || commissionBp <= 0) return agorot(0)
  return applyBp(agorot(baseAgorot), bp(commissionBp))
}

export type SettlementDecision =
  | { action: 'wait' }
  | {
      action: 'reverse'
      reason: 'order_cancelled' | 'order_refunded' | 'self_referral' | 'never_paid'
    }
  | { action: 'pay'; baseAgorot: Agorot; commissionAgorot: Agorot }

const DAY_MS = 86_400_000

/**
 * What to do with one pending attribution today. Pure, so the money rule is
 * tested without a database: an attribution is paid once, after the order was
 * paid AND the cancellation hold passed AND it was not cancelled or refunded,
 * and never to the affiliate on their own order.
 */
export function decideSettlement(input: {
  orderStatus: string
  paidAt: string | null
  createdAt: string
  orderTotalAgorot: number
  orderUserId: string | null
  affiliateUserId: string
  commissionBp: number
  now: Date
}): SettlementDecision {
  if (input.orderUserId && input.orderUserId === input.affiliateUserId) {
    return { action: 'reverse', reason: 'self_referral' }
  }
  if (input.orderStatus === 'cancelled') return { action: 'reverse', reason: 'order_cancelled' }
  if (input.orderStatus === 'refunded') return { action: 'reverse', reason: 'order_refunded' }
  if (!input.paidAt) {
    // An order that never paid in 7 days is abandoned, not late.
    const age = input.now.getTime() - new Date(input.createdAt).getTime()
    return age > 7 * DAY_MS ? { action: 'reverse', reason: 'never_paid' } : { action: 'wait' }
  }
  const held = input.now.getTime() - new Date(input.paidAt).getTime()
  if (held < SETTLEMENT_HOLD_DAYS * DAY_MS) return { action: 'wait' }
  const base = agorot(Math.max(0, Math.trunc(input.orderTotalAgorot)))
  return {
    action: 'pay',
    baseAgorot: base,
    commissionAgorot: commissionAgorot(base, input.commissionBp),
  }
}
