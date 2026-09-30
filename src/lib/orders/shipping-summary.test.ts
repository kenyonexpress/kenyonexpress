import { describe, expect, it } from 'vitest'
import { type ShippingLineLike, summarizeShipping } from './shipping-summary'

/**
 * The fold from lines to one chip. The order list has no other source for
 * "is this order still on its way", so each branch is pinned, including the
 * two that used to be easy to get wrong: a coupon-only order says nothing,
 * and a refunded line does not keep an otherwise-delivered order waiting.
 */

function line(over: Partial<ShippingLineLike> = {}): ShippingLineLike {
  return {
    productType: 'physical',
    itemStatus: 'pending',
    trackingNumber: null,
    carrier: null,
    ...over,
  }
}

describe('summarizeShipping', () => {
  it('has nothing to say about a coupon-only order', () => {
    const summary = summarizeShipping([line({ productType: 'coupon', itemStatus: 'issued' })])
    expect(summary.kind).toBe('none')
    expect(summary.label).toBeNull()
    expect(summary.tracked).toEqual([])
  })

  it('says "preparing" while no physical line has left', () => {
    const summary = summarizeShipping([line(), line({ itemStatus: 'issued' })])
    expect(summary).toMatchObject({ kind: 'preparing', label: 'בהכנה למשלוח', tone: 'default' })
  })

  it('says "shipped" once any line is on its way and none has arrived', () => {
    const summary = summarizeShipping([
      line({ itemStatus: 'shipped', trackingNumber: ' RR123 ', carrier: 'israel-post' }),
      line(),
    ])
    expect(summary).toMatchObject({ kind: 'shipped', label: 'נשלח', tone: 'warn' })
    expect(summary.tracked).toEqual([{ carrier: 'israel-post', trackingNumber: 'RR123' }])
  })

  it('says "partly delivered" while some live line is still out', () => {
    const summary = summarizeShipping([
      line({ itemStatus: 'delivered' }),
      line({ itemStatus: 'shipped', trackingNumber: 'X1' }),
    ])
    expect(summary).toMatchObject({ kind: 'partial', label: 'נמסר חלקית', tone: 'warn' })
  })

  it('says "delivered" when every live physical line has arrived', () => {
    const summary = summarizeShipping([
      line({ itemStatus: 'delivered', trackingNumber: 'A' }),
      line({ itemStatus: 'delivered', trackingNumber: 'B' }),
    ])
    expect(summary).toMatchObject({ kind: 'delivered', label: 'נמסר', tone: 'ok' })
    expect(summary.tracked).toHaveLength(2)
  })

  it('does not let a cancelled or refunded line hold the order open', () => {
    const summary = summarizeShipping([
      line({ itemStatus: 'delivered' }),
      line({ itemStatus: 'refunded' }),
      line({ itemStatus: 'cancelled', trackingNumber: 'DEAD' }),
    ])
    expect(summary.kind).toBe('delivered')
    // A tracking number on a dead line is not offered for tracking.
    expect(summary.tracked).toEqual([])
  })

  it('treats an order whose physical lines are all closed as nothing to ship', () => {
    const summary = summarizeShipping([line({ itemStatus: 'cancelled' })])
    expect(summary.kind).toBe('none')
  })

  it('ignores a blank tracking string', () => {
    const summary = summarizeShipping([line({ itemStatus: 'shipped', trackingNumber: '   ' })])
    expect(summary.tracked).toEqual([])
  })
})
