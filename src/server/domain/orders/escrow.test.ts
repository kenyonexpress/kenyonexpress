import { agorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import { EscrowError, createEscrowHold, refundEscrow, releaseEscrow } from './escrow'

const NOW = new Date('2026-07-21T10:00:00.000Z')
const LATER = new Date('2026-07-22T10:00:00.000Z')

function hold(overrides: Partial<Parameters<typeof createEscrowHold>[0]> = {}) {
  return createEscrowHold({
    couponCodeId: 'code-1',
    orderId: 'order-1',
    orderItemId: 'item-1',
    supplierId: 'supplier-1',
    heldAgorot: agorot(4000),
    commissionAgorot: agorot(200),
    now: NOW,
    ...overrides,
  })
}

describe('escrow holds', () => {
  it('creates a hold with exact conservation', () => {
    const h = hold()
    expect(h.status).toBe('held')
    expect(h.releaseAgorot).toBe(3800)
    expect(h.heldAgorot).toBe(h.commissionAgorot + h.releaseAgorot)
    expect(h.releasedAt).toBeNull()
    expect(h.refundedAt).toBeNull()
  })

  it('rejects commission above the held amount', () => {
    expect(() => hold({ commissionAgorot: agorot(4001) })).toThrowError(EscrowError)
  })

  it('allows a zero-amount hold (0% upfront edge case)', () => {
    const h = hold({ heldAgorot: agorot(0), commissionAgorot: agorot(0) })
    const { transferredAgorot } = releaseEscrow(h, 'rel:1', LATER)
    expect(transferredAgorot).toBe(0)
  })

  it('releases exactly once; same-key replay transfers nothing', () => {
    const first = releaseEscrow(hold(), 'rel:order-1:item-1', LATER)
    expect(first.replay).toBe(false)
    expect(first.transferredAgorot).toBe(3800)
    expect(first.hold.status).toBe('released')
    expect(first.hold.releasedAt).toBe(LATER.toISOString())

    const replay = releaseEscrow(first.hold, 'rel:order-1:item-1', new Date())
    expect(replay.replay).toBe(true)
    expect(replay.transferredAgorot).toBe(0)
    expect(replay.hold).toBe(first.hold)
  })

  it('rejects a second release under a different key (double-payout guard)', () => {
    const first = releaseEscrow(hold(), 'rel:a', LATER)
    try {
      releaseEscrow(first.hold, 'rel:b', LATER)
      expect.unreachable('second release must throw')
    } catch (error) {
      expect((error as EscrowError).code).toBe('ALREADY_RELEASED')
    }
  })

  it('refunds the full held amount, commission included', () => {
    const { hold: refunded, refundedAgorot } = refundEscrow(hold(), LATER)
    expect(refundedAgorot).toBe(4000)
    expect(refunded.status).toBe('refunded')
    expect(refunded.refundedAt).toBe(LATER.toISOString())
  })

  it('never refunds after release, never releases after refund', () => {
    const released = releaseEscrow(hold(), 'rel:1', LATER).hold
    try {
      refundEscrow(released, LATER)
      expect.unreachable('refund after release must throw')
    } catch (error) {
      expect((error as EscrowError).code).toBe('ALREADY_RELEASED')
    }

    const refunded = refundEscrow(hold(), LATER).hold
    try {
      releaseEscrow(refunded, 'rel:2', LATER)
      expect.unreachable('release after refund must throw')
    } catch (error) {
      expect((error as EscrowError).code).toBe('ALREADY_REFUNDED')
    }
    try {
      refundEscrow(refunded, LATER)
      expect.unreachable('double refund must throw')
    } catch (error) {
      expect((error as EscrowError).code).toBe('ALREADY_REFUNDED')
    }
  })

  it('requires a non-empty release idempotency key', () => {
    expect(() => releaseEscrow(hold(), '  ', LATER)).toThrowError(EscrowError)
  })
})
