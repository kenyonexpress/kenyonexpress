import { describe, expect, it, vi } from 'vitest'
import {
  REDEEMABLE_SETTLEMENT_STATUSES,
  markOrderItemRedeemed,
  planMarkOrderItemRedeemed,
} from './mark-order-item-redeemed'

describe('planMarkOrderItemRedeemed', () => {
  it('accepts a platform_settled coupon line', () => {
    expect(
      planMarkOrderItemRedeemed({
        orderItemId: 'oi-1',
        currentSettlementStatus: 'platform_settled',
      }),
    ).toEqual({ ok: true, next: 'redeemed' })
  })

  it('rejects a missing order item id', () => {
    expect(planMarkOrderItemRedeemed({ orderItemId: null })).toEqual({
      ok: false,
      reason: 'missing_id',
    })
  })

  it('rejects a line that is already refunded', () => {
    expect(
      planMarkOrderItemRedeemed({
        orderItemId: 'oi-1',
        currentSettlementStatus: 'refunded',
      }),
    ).toEqual({ ok: false, reason: 'not_eligible' })
  })

  it('lists the statuses the write may overwrite (no escrow_held)', () => {
    expect(REDEEMABLE_SETTLEMENT_STATUSES).toContain('platform_settled')
    expect(REDEEMABLE_SETTLEMENT_STATUSES).toContain('paid')
    expect(REDEEMABLE_SETTLEMENT_STATUSES).toContain('split_executed')
    expect(REDEEMABLE_SETTLEMENT_STATUSES).not.toContain('escrow_held')
  })
})

describe('markOrderItemRedeemed', () => {
  it('writes settlement_status=redeemed through the admin client', async () => {
    const inFn = vi.fn().mockResolvedValue({ error: null })
    const eqFn = vi.fn().mockReturnValue({ in: inFn })
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
    const fromFn = vi.fn().mockReturnValue({ update: updateFn })

    const result = await markOrderItemRedeemed({ from: fromFn }, 'oi-42')

    expect(result.error).toBeNull()
    expect(fromFn).toHaveBeenCalledWith('order_items')
    expect(updateFn).toHaveBeenCalledWith({ settlement_status: 'redeemed' })
    expect(eqFn).toHaveBeenCalledWith('id', 'oi-42')
    expect(inFn).toHaveBeenCalledWith('settlement_status', REDEEMABLE_SETTLEMENT_STATUSES)
  })
})
