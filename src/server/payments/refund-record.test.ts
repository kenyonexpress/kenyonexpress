import { type RefundRecordAdmin, groundFor, recordRefund } from '@/server/payments/refund-record'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

function stub(result: { error: { message: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(result)
  const admin = { from: vi.fn(() => ({ insert })) } as unknown as RefundRecordAdmin
  return { admin, insert }
}

const AT = new Date('2026-09-02T10:00:00.000Z')

const base = {
  orderId: 'ord-1',
  paymentId: 'pay-1',
  state: 'completed' as const,
  ground: 'distance_sale_14d' as const,
  requestedAgorot: 10_000,
  grantedAgorot: 9_500,
  cancellationFeeAgorot: 500,
  cancelOnly: false,
  reasonHe: 'ביטול עסקה',
  at: AT,
}

describe('the statutory record', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes every column the notice needs', async () => {
    const { admin, insert } = stub()
    await recordRefund(admin, base)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      order_id: 'ord-1',
      payment_id: 'pay-1',
      state: 'completed',
      ground: 'distance_sale_14d',
      requested_agorot: 10_000,
      granted_agorot: 9_500,
      cancellation_fee_agorot: 500,
      cancel_only: false,
      reason_he: 'ביטול עסקה',
    })
  })

  /**
   * An admin refund is decided and executed in one call, so all three stamps
   * are the same instant. `requested_at` is the one that matters beyond
   * bookkeeping: a trigger derives `refund_due_by` from it, and that is the
   * statutory 14-day deadline.
   */
  it('stamps requested, decided and completed together when the refund is closed', async () => {
    const { admin, insert } = stub()
    await recordRefund(admin, base)
    const row = insert.mock.calls[0]?.[0]
    expect(row.requested_at).toBe(AT.toISOString())
    expect(row.decided_at).toBe(AT.toISOString())
    expect(row.completed_at).toBe(AT.toISOString())
  })

  it('leaves decided and completed null for a refund that is only requested', async () => {
    const { admin, insert } = stub()
    await recordRefund(admin, { ...base, state: 'requested' })
    const row = insert.mock.calls[0]?.[0]
    expect(row.requested_at).toBe(AT.toISOString())
    expect(row.decided_at).toBeNull()
    expect(row.completed_at).toBeNull()
  })

  /**
   * The fee cap in 131 is `<= LEAST((requested_agorot + 19) / 20, 10000)`, so
   * the requested figure has to be the full charge. Recording the post-fee
   * amount instead would make a lawful 5% fee look like it broke the cap.
   */
  it('keeps the fee within 5% of the requested amount as 131 computes it', () => {
    const cap = Math.min(Math.floor((base.requestedAgorot + 19) / 20), 10_000)
    expect(base.cancellationFeeAgorot).toBeLessThanOrEqual(cap)
  })
})

describe('the ground a refund is made on', () => {
  // The law forbids a cancellation fee when the fault is the trader's, and 131
  // encodes that as a CHECK on these two grounds.
  it('is defect for a defect claim, which is a ground that may carry no fee', () => {
    expect(groundFor({ isDefectClaim: true })).toBe('defect')
  })

  it('is the ordinary distance-sale ground otherwise', () => {
    expect(groundFor({ isDefectClaim: false })).toBe('distance_sale_14d')
    expect(groundFor({})).toBe('distance_sale_14d')
  })
})

describe('a record that cannot be written never fails the refund', () => {
  beforeEach(() => vi.clearAllMocks())

  // The card is already credited by the time this runs. An error here that
  // propagated would be retried, and the retry would attempt a second credit.
  it('returns the error instead of throwing it', async () => {
    const { admin } = stub({ error: { message: 'violates check constraint' } })
    await expect(recordRefund(admin, base)).resolves.toEqual({
      error: 'violates check constraint',
    })
  })

  it('swallows a client that throws outright', async () => {
    const admin = {
      from: () => {
        throw new Error('connection refused')
      },
    } as unknown as RefundRecordAdmin
    const result = await recordRefund(admin, base)
    expect(result.error).toContain('connection refused')
  })
})
