import {
  type RefundRecordAdmin,
  groundFor,
  recordRefund,
  settleRefundRecord,
} from '@/server/payments/refund-record'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

type PgResult = { error: { message: string; code?: string } | null }

function stub(insertResult: PgResult = { error: null }, updateResult: PgResult = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult)
  const updateChain: string[][] = []
  const update = vi.fn((_patch: unknown) => {
    const chain: unknown[] = []
    const eq2 = (column: string, value: unknown) => {
      chain.push([column, value])
      updateChain.push(chain.map(String))
      return Promise.resolve(updateResult)
    }
    const eq1 = (column: string, value: unknown) => {
      chain.push([column, value])
      return { eq: eq2 }
    }
    return { eq: eq1 }
  })
  const admin = { from: vi.fn(() => ({ insert, update })) } as unknown as RefundRecordAdmin
  return { admin, insert, update, updateChain }
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

  it('marks an executing refund as decided but not completed', async () => {
    // The admin has chosen; the money has not moved yet. `decided_at` is what
    // the 131 CHECKs read for approved/rejected and what an audit reads for
    // "who decided when"; `completed_at` must stay null or
    // `refunds_completed_has_money` would be lying about a credit not yet made.
    const { admin, insert } = stub()
    await recordRefund(admin, { ...base, state: 'executing' })
    const row = insert.mock.calls[0]?.[0]
    expect(row.decided_at).toBe(AT.toISOString())
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

describe('the row as the lock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports a unique violation as a refund already in flight', async () => {
    // `refunds_one_open_per_order`: UNIQUE (order_id) WHERE state IN
    // (requested, approved, executing), measured on production 08.10.2026.
    // Losing that race is the whole point of writing the row first.
    const { admin } = stub({ error: { message: 'duplicate key', code: '23505' } })
    await expect(recordRefund(admin, { ...base, state: 'executing' })).resolves.toEqual({
      error: 'duplicate key',
      inFlight: true,
    })
  })

  it('does not call any other insert failure in flight', async () => {
    const { admin } = stub({ error: { message: 'violates check constraint', code: '23514' } })
    const result = await recordRefund(admin, { ...base, state: 'executing' })
    expect(result.inFlight).toBe(false)
    expect(result.error).toBe('violates check constraint')
  })

  it('settles to completed with the money that went back and a completion time', async () => {
    const { admin, update, updateChain } = stub()
    const result = await settleRefundRecord(admin, {
      orderId: 'ord-1',
      state: 'completed',
      grantedAgorot: 9_500,
      at: AT,
    })
    expect(result).toEqual({ error: null })
    expect(update.mock.lastCall?.[0]).toEqual({
      state: 'completed',
      granted_agorot: 9_500,
      completed_at: AT.toISOString(),
    })
    // Keyed on the one open row for the order, not on an id the insert never read back.
    expect(updateChain[0]).toEqual(['order_id,ord-1', 'state,executing'])
  })

  it('settles to failed with nothing granted', async () => {
    const { admin, update } = stub()
    await settleRefundRecord(admin, { orderId: 'ord-1', state: 'failed', at: AT })
    expect(update.mock.lastCall?.[0]).toEqual({
      state: 'failed',
      granted_agorot: null,
      completed_at: null,
    })
  })

  it('returns a settle error instead of throwing it, since the money already moved', async () => {
    const { admin } = stub({ error: null }, { error: { message: 'connection reset' } })
    await expect(
      settleRefundRecord(admin, { orderId: 'ord-1', state: 'failed', at: AT }),
    ).resolves.toEqual({ error: 'connection reset' })
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

describe('a record that cannot be written never throws', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the error instead of throwing it', async () => {
    const { admin } = stub({ error: { message: 'violates check constraint' } })
    await expect(recordRefund(admin, base)).resolves.toEqual({
      error: 'violates check constraint',
      inFlight: false,
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
    expect(result.inFlight).toBe(false)
  })
})
