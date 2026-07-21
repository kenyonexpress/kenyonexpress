import type { Agorot } from '@/lib/commerce/money'
import { agorot } from '@/lib/commerce/money'

export type EscrowHoldStatus = 'held' | 'released' | 'refunded'

export interface EscrowHold {
  couponCodeId: string
  orderId: string
  orderItemId: string
  supplierId: string
  heldAgorot: Agorot
  commissionAgorot: Agorot
  releaseAgorot: Agorot
  status: EscrowHoldStatus
  heldAt: string
  releasedAt: string | null
  refundedAt: string | null
  releaseIdempotencyKey: string | null
}

export type EscrowErrorCode =
  | 'INVALID_AMOUNTS'
  | 'ALREADY_RELEASED'
  | 'ALREADY_REFUNDED'
  | 'NOT_HELD'

export class EscrowError extends Error {
  readonly code: EscrowErrorCode

  constructor(code: EscrowErrorCode, message: string) {
    super(message)
    this.name = 'EscrowError'
    this.code = code
  }
}

/** Creates a hold row. Conservation: held = commission + release, all non-negative. */
export function createEscrowHold(input: {
  couponCodeId: string
  orderId: string
  orderItemId: string
  supplierId: string
  heldAgorot: Agorot
  commissionAgorot: Agorot
  now: Date
}): EscrowHold {
  const release = input.heldAgorot - input.commissionAgorot
  if (input.heldAgorot < 0 || input.commissionAgorot < 0 || release < 0) {
    throw new EscrowError('INVALID_AMOUNTS', 'escrow hold requires held >= commission >= 0')
  }
  return {
    couponCodeId: input.couponCodeId,
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    supplierId: input.supplierId,
    heldAgorot: input.heldAgorot,
    commissionAgorot: input.commissionAgorot,
    releaseAgorot: agorot(release),
    status: 'held',
    heldAt: input.now.toISOString(),
    releasedAt: null,
    refundedAt: null,
    releaseIdempotencyKey: null,
  }
}

export interface EscrowReleaseResult {
  hold: EscrowHold
  /** Amount transferred to the supplier by THIS call (0 on idempotent replay). */
  transferredAgorot: Agorot
  replay: boolean
}

/**
 * Releases a hold to the supplier after redemption.
 * Same idempotency key => no-op replay. Different key on a released hold, or
 * any release on a refunded hold => error. Money moves exactly once.
 */
export function releaseEscrow(
  hold: EscrowHold,
  idempotencyKey: string,
  now: Date,
): EscrowReleaseResult {
  if (!idempotencyKey.trim()) {
    throw new EscrowError('INVALID_AMOUNTS', 'release idempotency key is required')
  }
  if (hold.status === 'refunded') {
    throw new EscrowError('ALREADY_REFUNDED', 'cannot release a refunded escrow hold')
  }
  if (hold.status === 'released') {
    if (hold.releaseIdempotencyKey === idempotencyKey) {
      return { hold, transferredAgorot: agorot(0), replay: true }
    }
    throw new EscrowError('ALREADY_RELEASED', 'escrow hold was already released')
  }
  const released: EscrowHold = {
    ...hold,
    status: 'released',
    releasedAt: now.toISOString(),
    releaseIdempotencyKey: idempotencyKey,
  }
  return { hold: released, transferredAgorot: hold.releaseAgorot, replay: false }
}

export interface EscrowRefundResult {
  hold: EscrowHold
  /** Refunded to the customer: the full held amount (commission is returned too). */
  refundedAgorot: Agorot
}

/**
 * Refunds a hold to the customer (coupon not redeemed: expiry / cancellation
 * inside the legal window). Only legal from `held`.
 */
export function refundEscrow(hold: EscrowHold, now: Date): EscrowRefundResult {
  if (hold.status === 'released') {
    throw new EscrowError('ALREADY_RELEASED', 'cannot refund escrow after release to supplier')
  }
  if (hold.status === 'refunded') {
    throw new EscrowError('ALREADY_REFUNDED', 'escrow hold was already refunded')
  }
  const refunded: EscrowHold = {
    ...hold,
    status: 'refunded',
    refundedAt: now.toISOString(),
  }
  return { hold: refunded, refundedAgorot: hold.heldAgorot }
}
