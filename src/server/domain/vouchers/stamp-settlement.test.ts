import { describe, expect, it, vi } from 'vitest'
import { REDEEMABLE_SETTLEMENT_STATUSES } from './mark-order-item-redeemed'
import { type StampAdmin, stampSettlementRedeemed } from './stamp-settlement'

vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

/**
 * Builds a fake service-role client covering exactly the two calls the stamp
 * makes: the voucher lookup and the order line update.
 */
function admin(opts: {
  voucher?: { order_item_id: string | null } | null
  lookupError?: { message: string } | null
  updateError?: { message: string } | null
}) {
  const inFn = vi.fn().mockResolvedValue({ error: opts.updateError ?? null })
  const eqUpdate = vi.fn().mockReturnValue({ in: inFn })
  const updateFn = vi.fn().mockReturnValue({ eq: eqUpdate })

  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.voucher ?? null,
    error: opts.lookupError ?? null,
  })
  const eqSelect = vi.fn().mockReturnValue({ maybeSingle })
  const selectFn = vi.fn().mockReturnValue({ eq: eqSelect })

  const from = vi.fn((table: string) =>
    table === 'vouchers' ? { select: selectFn } : { update: updateFn },
  )

  return {
    client: { from } as unknown as StampAdmin,
    from,
    selectFn,
    eqSelect,
    updateFn,
    eqUpdate,
    inFn,
  }
}

describe('stampSettlementRedeemed', () => {
  it('resolves the order line from the voucher id and stamps it redeemed', async () => {
    const a = admin({ voucher: { order_item_id: 'oi-7' } })

    await stampSettlementRedeemed('v-1', a.client)

    expect(a.from).toHaveBeenCalledWith('vouchers')
    expect(a.selectFn).toHaveBeenCalledWith('order_item_id')
    expect(a.eqSelect).toHaveBeenCalledWith('id', 'v-1')

    expect(a.from).toHaveBeenCalledWith('order_items')
    expect(a.updateFn).toHaveBeenCalledWith({ settlement_status: 'redeemed' })
    expect(a.eqUpdate).toHaveBeenCalledWith('id', 'oi-7')
  })

  it('never overwrites a refunded or cancelled line', async () => {
    const a = admin({ voucher: { order_item_id: 'oi-7' } })

    await stampSettlementRedeemed('v-1', a.client)

    // The guard is the .in() filter, so the write is a no-op on any status
    // outside this list. refunded and cancelled are the ones that matter.
    expect(a.inFn).toHaveBeenCalledWith('settlement_status', REDEEMABLE_SETTLEMENT_STATUSES)
    expect(REDEEMABLE_SETTLEMENT_STATUSES).not.toContain('refunded')
    expect(REDEEMABLE_SETTLEMENT_STATUSES).not.toContain('cancelled')
    expect(REDEEMABLE_SETTLEMENT_STATUSES).not.toContain('escrow_held')
  })

  it('does not write when the voucher carries no order line', async () => {
    const a = admin({ voucher: { order_item_id: null } })

    await stampSettlementRedeemed('v-1', a.client)

    expect(a.updateFn).not.toHaveBeenCalled()
  })

  it('does not write when the voucher cannot be found', async () => {
    const a = admin({ voucher: null })

    await stampSettlementRedeemed('v-missing', a.client)

    expect(a.updateFn).not.toHaveBeenCalled()
  })

  it('swallows a lookup failure without writing or throwing', async () => {
    const a = admin({ lookupError: { message: 'connection reset' } })

    await expect(stampSettlementRedeemed('v-1', a.client)).resolves.toBeUndefined()
    expect(a.updateFn).not.toHaveBeenCalled()
  })

  it('swallows an update failure without throwing', async () => {
    // The voucher is already burned by the time this runs, so losing the
    // status label must never surface as a failed redemption at the till.
    const a = admin({ voucher: { order_item_id: 'oi-7' }, updateError: { message: 'denied' } })

    await expect(stampSettlementRedeemed('v-1', a.client)).resolves.toBeUndefined()
  })
})
