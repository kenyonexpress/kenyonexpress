import { describe, expect, it } from 'vitest'
import {
  CURRENCY,
  type CommerceEventInput,
  buildGaPayload,
  buildMetaPayload,
  metaEventFor,
  toCurrencyAmount,
} from './ecommerce'

const INPUT: CommerceEventInput = {
  items: [
    {
      id: 'p1',
      name: 'ארוחה זוגית',
      priceAgorot: 12_900,
      quantity: 2,
      category: 'מסעדות',
      supplier: 'ביסטרו',
    },
  ],
  valueAgorot: 25_800,
  transactionId: 'order-1',
}

describe('toCurrencyAmount', () => {
  it('divides agorot exactly once, at the vendor boundary', () => {
    expect(toCurrencyAmount(12_900)).toBe(129)
    expect(toCurrencyAmount(1)).toBe(0.01)
    expect(toCurrencyAmount(0)).toBe(0)
  })

  it('rounds a fractional agora rather than reporting 12.345', () => {
    // A fraction here is a bug upstream. Passing it on puts a nonsense number
    // in a revenue report where nobody will question it.
    expect(toCurrencyAmount(1234.6)).toBe(12.35)
  })

  it('never emits NaN into a revenue field', () => {
    expect(toCurrencyAmount(Number.NaN)).toBe(0)
    expect(toCurrencyAmount(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('buildGaPayload', () => {
  const payload = buildGaPayload(INPUT)

  it('states shekels and the amount that actually moved', () => {
    expect(payload.currency).toBe(CURRENCY)
    expect(payload.value).toBe(258)
  })

  it('carries the transaction id so GA4 can deduplicate a replayed purchase', () => {
    expect(payload.transaction_id).toBe('order-1')
  })

  it('omits optional fields rather than sending empty strings', () => {
    // GA4 treats an empty `coupon` as a real dimension value and it shows up as
    // a blank row in every report that groups by it.
    const bare = buildGaPayload({ items: [], valueAgorot: 0 })
    expect('transaction_id' in bare).toBe(false)
    expect('coupon' in bare).toBe(false)
  })

  it('maps the supplier onto item_brand, which is otherwise always empty', () => {
    expect(payload.items[0]?.item_brand).toBe('ביסטרו')
    expect(payload.items[0]?.item_category).toBe('מסעדות')
  })

  it('prices per unit, not per line', () => {
    // GA4 multiplies price by quantity itself. Sending the line total here
    // doubles the reported item revenue.
    expect(payload.items[0]?.price).toBe(129)
    expect(payload.items[0]?.quantity).toBe(2)
  })
})

describe('buildMetaPayload', () => {
  const payload = buildMetaPayload(INPUT)

  it('carries content_type, without which nothing is attributed', () => {
    expect(payload.content_type).toBe('product')
    expect(payload.content_ids).toEqual(['p1'])
  })

  it('counts units, not lines', () => {
    expect(payload.num_items).toBe(2)
  })

  it('agrees with GA4 about the value, to the agora', () => {
    // The two dashboards reporting different numbers for the same week, with
    // nobody able to say which is wrong, is the failure this shape prevents.
    expect(payload.value).toBe(buildGaPayload(INPUT).value)
  })
})

describe('metaEventFor', () => {
  it('maps the four events Meta actually has', () => {
    expect(metaEventFor('view_item')).toBe('ViewContent')
    expect(metaEventFor('add_to_cart')).toBe('AddToCart')
    expect(metaEventFor('begin_checkout')).toBe('InitiateCheckout')
    expect(metaEventFor('purchase')).toBe('Purchase')
  })

  it('sends a redemption to Meta as nothing at all', () => {
    // The money moved weeks earlier. Reporting it as a Purchase would
    // double-count revenue in the platform that decides ad spend against it.
    expect(metaEventFor('redeem_coupon')).toBeNull()
  })
})
