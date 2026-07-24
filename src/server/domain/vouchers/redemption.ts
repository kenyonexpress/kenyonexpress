import { type Agorot, agorot } from '@/lib/commerce/money'
import type { VoucherState } from './state-machine'

/**
 * Pure redemption logic. No database, no HTTP. The outcomes mirror
 * public.voucher_scan_outcome (051). Persistence is the final arbiter under
 * concurrency (conditional UPDATE + partial unique index); this decides what a
 * given snapshot should resolve to and computes the money to display.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md sections 4-5.
 */

export type RedemptionOutcome =
  | 'success'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'wrong_supplier'
  | 'not_found'

/** Outcomes the caller is allowed to see the honest version of. */
export type PublicRedemptionOutcome =
  | 'success'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'not_found'

export interface RedeemableVoucher {
  code: string
  status: VoucherState
  supplierId: string
  expiresAt: string
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingAmountDueAgorot: number
}

/**
 * Resolves a voucher snapshot to an outcome. wrong_supplier is returned
 * distinctly here so the audit log can record the truth; the API collapses it
 * to not_found before answering the caller (toPublicOutcome).
 */
export function validateVoucherRedemption(input: {
  voucher: RedeemableVoucher | null
  requestingSupplierId: string
  now: Date
}): RedemptionOutcome {
  const { voucher, requestingSupplierId, now } = input
  if (!voucher) return 'not_found'
  if (voucher.supplierId !== requestingSupplierId) return 'wrong_supplier'
  if (voucher.status === 'redeemed') return 'already_redeemed'
  if (voucher.status === 'cancelled') return 'cancelled'
  if (voucher.status === 'refunded') return 'refunded'
  if (voucher.status === 'expired') return 'expired'
  // Still 'issued' but past the deadline: expired before the sweep ran.
  if (new Date(voucher.expiresAt).getTime() <= now.getTime()) return 'expired'
  return 'success'
}

/** Anti-enumeration collapse applied before answering the scanner. */
export function toPublicOutcome(outcome: RedemptionOutcome): PublicRedemptionOutcome {
  return outcome === 'wrong_supplier' ? 'not_found' : outcome
}

/**
 * Money the business collects at the counter on a successful scan. It is the
 * snapshot balance, independent of any later product edit. The customer already
 * paid couponPrice online; face = couponPrice + balance is re-asserted here so
 * a corrupted snapshot cannot silently under- or over-charge.
 */
export function amountToCollect(voucher: RedeemableVoucher): Agorot {
  const face = voucher.faceValueAgorot
  const online = voucher.couponPriceAgorot
  const balance = voucher.remainingAmountDueAgorot
  if (online + balance !== face) {
    throw new RangeError(
      'voucher money snapshot violates conservation (face != coupon_price + due)',
    )
  }
  return agorot(balance)
}

const HTTP_BY_OUTCOME: Record<PublicRedemptionOutcome, number> = {
  success: 200,
  already_redeemed: 409,
  expired: 409,
  cancelled: 409,
  refunded: 409,
  not_found: 404,
}

export function httpStatusForOutcome(outcome: PublicRedemptionOutcome): number {
  return HTTP_BY_OUTCOME[outcome]
}
