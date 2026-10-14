import { agorot } from '@/lib/money'
import type { OrderListLine } from '@/server/queries/orders'
import { describe, expect, it } from 'vitest'
import {
  canReorder,
  itemCountPhrase,
  linePreview,
  lineStatusView,
  orderBadges,
  toggleLabel,
} from './order-card'

function line(over: Partial<OrderListLine> = {}): OrderListLine {
  return {
    id: 'i1',
    productId: 'p1',
    productName: 'קופון למסעדה',
    productSlug: 'coupon',
    productImage: null,
    productType: 'coupon',
    quantity: 1,
    unitPriceAgorot: agorot(4000),
    totalAgorot: agorot(4000),
    settlementStatus: 'split_executed',
    itemStatus: 'pending',
    carrier: null,
    trackingNumber: null,
    ...over,
  }
}

/**
 * UX19: the words on the order card, decided without a DOM.
 */
describe('order card wording', () => {
  it('counts items in Hebrew without "1 פריטים"', () => {
    expect(itemCountPhrase(1)).toBe('פריט אחד')
    expect(itemCountPhrase(2)).toBe('2 פריטים')
    expect(itemCountPhrase(0)).toBe('0 פריטים')
  })

  it('previews the first names, a count on a repeated line, and "ועוד N"', () => {
    expect(linePreview([])).toBe('')
    expect(linePreview([line()])).toBe('קופון למסעדה')
    expect(linePreview([line({ quantity: 3 })])).toBe('קופון למסעדה ×3')
    expect(
      linePreview([
        line({ id: 'a', productName: 'א' }),
        line({ id: 'b', productName: 'ב' }),
        line({ id: 'c', productName: 'ג' }),
        line({ id: 'd', productName: 'ד' }),
      ]),
    ).toBe('א, ב ועוד 2')
  })

  it('falls back to "מוצר" for a blank name', () => {
    expect(linePreview([line({ productName: '  ' })])).toBe('מוצר')
  })

  it('labels the toggle by state and count', () => {
    expect(toggleLabel(false, 1)).toBe('הצגת הפריט')
    expect(toggleLabel(false, 3)).toBe('הצגת הפריטים (3)')
    expect(toggleLabel(true, 3)).toBe('הסתרת הפריטים')
  })
})

describe('lineStatusView', () => {
  it('reads a physical line from item_status', () => {
    expect(lineStatusView(line({ productType: 'physical', itemStatus: 'shipped' }))).toEqual({
      label: 'נשלח',
      tone: 'warn',
    })
    expect(lineStatusView(line({ productType: 'physical', itemStatus: 'delivered' }))).toEqual({
      label: 'נמסר',
      tone: 'ok',
    })
    expect(lineStatusView(line({ productType: 'physical', itemStatus: 'pending' }))).toEqual({
      label: 'בהכנה',
      tone: 'default',
    })
    expect(lineStatusView(line({ productType: 'physical', itemStatus: 'refunded' }))).toEqual({
      label: 'זוכה',
      tone: 'dead',
    })
  })

  it('says nothing about an open coupon: the clock on the detail page decides', () => {
    expect(lineStatusView(line({ settlementStatus: 'split_executed' }))).toBeNull()
    expect(lineStatusView(line({ settlementStatus: 'paid' }))).toBeNull()
    expect(lineStatusView(line({ settlementStatus: 'pending' }))).toBeNull()
  })

  it('does say when the coupon question is closed', () => {
    expect(lineStatusView(line({ settlementStatus: 'redeemed' }))).toEqual({
      label: 'מומש',
      tone: 'ok',
    })
    expect(lineStatusView(line({ settlementStatus: 'refunded' }))).toEqual({
      label: 'זוכה',
      tone: 'dead',
    })
    expect(lineStatusView(line({ itemStatus: 'cancelled' }))).toEqual({
      label: 'בוטל',
      tone: 'dead',
    })
  })

  it('returns null for an unknown physical status rather than the raw key', () => {
    expect(lineStatusView(line({ productType: 'physical', itemStatus: 'weird' }))).toBeNull()
  })
})

describe('orderBadges', () => {
  const settlement = { label: 'הושלמה', tone: 'ok' as const }

  it('is the money chip alone for coupons-only and for an unpaid order', () => {
    expect(
      orderBadges(
        {
          paidAt: '2026-10-01',
          shipping: { kind: 'none', label: null, tone: 'default', tracked: [] },
        },
        settlement,
      ),
    ).toEqual([settlement])
    expect(
      orderBadges(
        {
          paidAt: null,
          shipping: { kind: 'preparing', label: 'בהכנה למשלוח', tone: 'default', tracked: [] },
        },
        settlement,
      ),
    ).toEqual([settlement])
  })

  it('adds the parcel chip after the money chip on a paid order', () => {
    expect(
      orderBadges(
        {
          paidAt: '2026-10-01',
          shipping: { kind: 'shipped', label: 'נשלח', tone: 'warn', tracked: [] },
        },
        settlement,
      ),
    ).toEqual([settlement, { label: 'נשלח', tone: 'warn' }])
  })
})

describe('canReorder', () => {
  it('needs a paid order with at least one line', () => {
    expect(canReorder({ paidAt: '2026-10-01', lines: [line()] })).toBe(true)
    expect(canReorder({ paidAt: null, lines: [line()] })).toBe(false)
    expect(canReorder({ paidAt: '2026-10-01', lines: [] })).toBe(false)
  })
})
