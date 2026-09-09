import { describe, expect, it } from 'vitest'
import { type NoticeLine, buildShippedNotice } from './shipped-notice'

const ORDER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const AT = '2026-09-10T09:00:00.000Z'

function line(over: Partial<NoticeLine> = {}): NoticeLine {
  return {
    id: 'item-1',
    itemStatus: 'pending',
    productType: 'physical',
    carrier: null,
    trackingNumber: null,
    ...over,
  }
}

function notice(lines: NoticeLine[], shippedItemId = 'item-1') {
  return buildShippedNotice({ orderId: ORDER, shippedItemId, lines, at: AT, customerName: 'דנה' })
}

describe('buildShippedNotice', () => {
  it('takes the order-level key when the whole order has gone out', () => {
    const result = notice([line({ itemStatus: 'shipped', trackingNumber: 'RR1' })])
    expect(result.partial).toBe(false)
    // Exactly the key `tg_orders_notify_shipped` uses, so a later flip to
    // `fulfilled` cannot mail the customer a second time.
    expect(result.dedupeKey).toBe(`order-shipped:${ORDER}`)
  })

  it('takes a per-line key while parcels are still outstanding', () => {
    const result = notice([
      line({ id: 'item-1', itemStatus: 'shipped', trackingNumber: 'RR1' }),
      line({ id: 'item-2', itemStatus: 'pending' }),
    ])
    expect(result.partial).toBe(true)
    expect(result.dedupeKey).toBe(`order-shipped:${ORDER}:item-1`)
    expect(result.payload.partial).toBe(true)
    expect(result.payload.shipped_count).toBe(1)
  })

  it('gives each parcel its own key, so the second one is not deduped away', () => {
    const lines = [
      line({ id: 'item-1', itemStatus: 'shipped', trackingNumber: 'RR1' }),
      line({ id: 'item-2', itemStatus: 'pending' }),
      line({ id: 'item-3', itemStatus: 'pending' }),
    ]
    const first = buildShippedNotice({
      orderId: ORDER,
      shippedItemId: 'item-1',
      lines,
      at: AT,
      customerName: null,
    })
    lines[1] = line({ id: 'item-2', itemStatus: 'shipped', trackingNumber: 'RR2' })
    const second = buildShippedNotice({
      orderId: ORDER,
      shippedItemId: 'item-2',
      lines,
      at: AT,
      customerName: null,
    })
    expect(first.dedupeKey).not.toBe(second.dedupeKey)
  })

  it('carries every known number, not only the parcel that just left', () => {
    const result = notice(
      [
        line({ id: 'item-1', itemStatus: 'shipped', carrier: 'HFD', trackingNumber: 'RR1' }),
        line({ id: 'item-2', itemStatus: 'delivered', carrier: 'דואר', trackingNumber: 'RR2' }),
      ],
      'item-1',
    )
    expect(result.payload.shipments).toEqual([
      { carrier: 'HFD', tracking_number: 'RR1' },
      { carrier: 'דואר', tracking_number: 'RR2' },
    ])
  })

  it('reports null shipments rather than an empty array when nothing was recorded', () => {
    // The email builder reads a missing array as "no tracking to report" and
    // renders the mail exactly as it did before 155.
    const result = notice([line({ itemStatus: 'shipped' })])
    expect(result.payload.shipments).toBeNull()
  })

  it('does not count a cancelled line as still outstanding', () => {
    const result = notice([
      line({ id: 'item-1', itemStatus: 'shipped', trackingNumber: 'RR1' }),
      line({ id: 'item-2', itemStatus: 'cancelled' }),
    ])
    expect(result.partial).toBe(false)
    expect(result.payload.item_count).toBe(1)
  })

  it('ignores coupon lines, which do not ship', () => {
    const result = notice([
      line({ id: 'item-1', itemStatus: 'shipped', trackingNumber: 'RR1' }),
      line({ id: 'item-2', itemStatus: 'issued', productType: 'coupon' }),
    ])
    expect(result.partial).toBe(false)
    expect(result.payload.item_count).toBe(1)
  })

  it('carries the fields the email and in-app builders read', () => {
    const result = notice([line({ itemStatus: 'shipped', trackingNumber: 'RR1' })])
    expect(result.payload).toMatchObject({
      order_id: ORDER,
      order_ref: ORDER.slice(0, 8).toUpperCase(),
      customer_name: 'דנה',
      item_count: 1,
      fulfilled_at: AT,
    })
  })
})
