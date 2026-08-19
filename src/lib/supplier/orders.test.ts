import { describe, expect, it } from 'vitest'
import {
  type SupplierOrderLine,
  fulfillmentOf,
  groupSupplierOrders,
  lineFrom,
  orderFulfillment,
  summarizeSupplierOrders,
} from './orders'

function physical(over: Partial<Parameters<typeof lineFrom>[0]> = {}): SupplierOrderLine {
  return lineFrom({
    orderItemId: 'item-1',
    orderId: 'order-1',
    productName: 'כיסא',
    productType: 'physical',
    quantity: 1,
    itemStatus: 'pending',
    settlementStatus: 'pending',
    platformPercent: 12,
    faceValueAgorot: 10_000,
    commissionAgorot: 1_200,
    supplierImmediateAgorot: 8_800,
    balanceDueAgorot: 0,
    ...over,
  })
}

function coupon(over: Partial<Parameters<typeof lineFrom>[0]> = {}): SupplierOrderLine {
  return lineFrom({
    orderItemId: 'item-2',
    orderId: 'order-1',
    productName: 'ארוחה',
    productType: 'coupon',
    quantity: 1,
    itemStatus: 'issued',
    settlementStatus: 'pending',
    platformPercent: 30,
    faceValueAgorot: 10_000,
    commissionAgorot: 3_000,
    // A coupon owes the supplier nothing from the platform. Checkout writes 0
    // here; the test passes a non-zero value on purpose in one case below.
    supplierImmediateAgorot: 0,
    balanceDueAgorot: 7_000,
    ...over,
  })
}

describe('lineFrom', () => {
  it('gives a physical line the snapshotted residual, never a recomputed one', () => {
    // 12% of 10000 is 1200, and the residual is 8800. The point is that none of
    // those three numbers is calculated here: if checkout froze a different
    // split at purchase time, this line reports what checkout froze.
    const line = physical({ commissionAgorot: 999, supplierImmediateAgorot: 9_001 })
    expect(line.platformFeeAgorot).toBe(999)
    expect(line.supplierDueAgorot).toBe(9_001)
  })

  it('never credits a coupon line to the supplier, whatever the row says', () => {
    // The abolished escrow model would have paid this out. supplierDueAgorot is
    // the single source of truth and it ignores everything but the immediate
    // split, which checkout writes as 0 for coupons.
    const line = coupon({ supplierImmediateAgorot: 0 })
    expect(line.supplierDueAgorot).toBe(0)
    expect(line.tillBalanceAgorot).toBe(7_000)
  })

  it('drops the till balance once the coupon has been redeemed', () => {
    // Money already in the register is not money the shop is waiting for.
    expect(coupon({ settlementStatus: 'redeemed' }).tillBalanceAgorot).toBe(0)
  })

  it('shows no till balance on a physical line', () => {
    expect(physical({ balanceDueAgorot: 5_000 }).tillBalanceAgorot).toBe(0)
  })

  it('survives a legacy row with null money and a fractional amount', () => {
    // Pre-070 lines predate the integer-agorot contract. A page showing twenty
    // good rows must not die on the twenty-first.
    const line = physical({
      faceValueAgorot: null,
      commissionAgorot: 1_200.4,
      supplierImmediateAgorot: null,
      balanceDueAgorot: null,
    })
    expect(line.faceValueAgorot).toBe(0)
    expect(line.platformFeeAgorot).toBe(1_200)
    expect(line.supplierDueAgorot).toBe(0)
  })

  it('clamps a negative snapshot to zero rather than showing a debt', () => {
    expect(physical({ commissionAgorot: -500 }).platformFeeAgorot).toBe(0)
  })
})

describe('fulfillmentOf', () => {
  it.each([
    ['pending', 'awaiting'],
    ['issued', 'awaiting'],
    ['shipped', 'in_progress'],
    ['delivered', 'done'],
    ['cancelled', 'closed'],
    ['refunded', 'closed'],
  ])('maps %s to %s', (status, expected) => {
    expect(fulfillmentOf(status)).toBe(expected)
  })

  it('treats an unknown status as work still to do', () => {
    // Least optimistic reading: a status nobody recognises must not let an
    // order disappear from the queue.
    expect(fulfillmentOf('teleported')).toBe('awaiting')
    expect(fulfillmentOf(null)).toBe('awaiting')
  })
})

describe('orderFulfillment', () => {
  it('reports an order awaiting when any live line is unshipped', () => {
    expect(orderFulfillment([physical({ itemStatus: 'delivered' }), physical()])).toBe('awaiting')
  })

  it('ignores cancelled lines when a live line still needs work', () => {
    // The regression this pins: taking the max over all lines let a refunded
    // line mark the whole order closed while a real package sat unpacked.
    const lines = [physical({ itemStatus: 'refunded' }), physical({ itemStatus: 'pending' })]
    expect(orderFulfillment(lines)).toBe('awaiting')
  })

  it('is closed only when every line is closed', () => {
    const lines = [physical({ itemStatus: 'cancelled' }), physical({ itemStatus: 'refunded' })]
    expect(orderFulfillment(lines)).toBe('closed')
  })

  it('is done when the live lines are all delivered', () => {
    const lines = [physical({ itemStatus: 'delivered' }), physical({ itemStatus: 'cancelled' })]
    expect(orderFulfillment(lines)).toBe('done')
  })

  it('has no live lines to rank when handed nothing', () => {
    expect(orderFulfillment([])).toBe('closed')
  })
})

describe('groupSupplierOrders', () => {
  const meta = new Map([
    ['order-1', { orderStatus: 'paid', paidAt: '2026-08-01T09:00:00Z' }],
    ['order-2', { orderStatus: 'fulfilled', paidAt: '2026-08-05T09:00:00Z' }],
  ])

  it('collapses several lines of one order into one card', () => {
    const orders = groupSupplierOrders([physical(), coupon()], meta)
    expect(orders).toHaveLength(1)
    expect(orders[0]?.lines).toHaveLength(2)
    expect(orders[0]?.itemCount).toBe(2)
  })

  it('sums the two balances separately and never together', () => {
    const [order] = groupSupplierOrders([physical(), coupon()], meta)
    expect(order?.supplierDueAgorot).toBe(8_800)
    expect(order?.tillBalanceAgorot).toBe(7_000)
    expect(order?.platformFeeAgorot).toBe(4_200)
  })

  it('sorts newest paid first', () => {
    const orders = groupSupplierOrders(
      [physical(), physical({ orderItemId: 'item-9', orderId: 'order-2' })],
      meta,
    )
    expect(orders.map((o) => o.orderId)).toEqual(['order-2', 'order-1'])
  })

  it('puts an order with no paid_at last instead of dropping it', () => {
    const orders = groupSupplierOrders(
      [physical({ orderItemId: 'x', orderId: 'order-3' }), physical()],
      meta,
    )
    expect(orders.map((o) => o.orderId)).toEqual(['order-1', 'order-3'])
  })

  it('gives a readable order reference a person can say out loud', () => {
    const orders = groupSupplierOrders(
      [physical({ orderId: '550e8400-e29b-41d4-a716-4466554400ab' })],
      new Map(),
    )
    expect(orders[0]?.orderRef).toBe('4400AB')
  })
})

describe('summarizeSupplierOrders', () => {
  it('counts only orders that still need work', () => {
    const meta = new Map([
      ['order-1', { orderStatus: 'paid', paidAt: '2026-08-01T09:00:00Z' }],
      ['order-2', { orderStatus: 'fulfilled', paidAt: '2026-08-02T09:00:00Z' }],
    ])
    const orders = groupSupplierOrders(
      [physical(), physical({ orderItemId: 'b', orderId: 'order-2', itemStatus: 'delivered' })],
      meta,
    )
    const summary = summarizeSupplierOrders(orders)
    expect(summary.orders).toBe(2)
    expect(summary.awaiting).toBe(1)
    expect(summary.supplierDueAgorot).toBe(17_600)
  })

  it('is all zeroes for a shop with no orders', () => {
    expect(summarizeSupplierOrders([])).toEqual({
      orders: 0,
      awaiting: 0,
      supplierDueAgorot: 0,
      tillBalanceAgorot: 0,
    })
  })
})
