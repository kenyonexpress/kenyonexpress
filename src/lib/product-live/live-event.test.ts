import { describe, expect, it } from 'vitest'
import {
  applyProductLiveEvent,
  initialProductLiveState,
  parseProductLiveEvent,
  productLiveTopic,
} from './live-event'

/**
 * The client-side contract for migration 235's broadcast payload.
 *
 * The trigger builds exactly these seven keys with jsonb_build_object; this
 * file pins what the page does with them and, just as much, what it refuses.
 */

const ID = '11111111-1111-4111-8111-111111111111'

const PAYLOAD = {
  product_id: ID,
  stock_quantity: 7,
  available: 5,
  kenyon_price: 199,
  full_price: 299,
  status: 'active',
  deleted_at: null,
}

describe('parseProductLiveEvent', () => {
  it('accepts the payload the 235 trigger builds', () => {
    expect(parseProductLiveEvent(PAYLOAD)).toEqual({
      productId: ID,
      stockQuantity: 7,
      available: 5,
      kenyonPrice: 199,
      fullPrice: 299,
      status: 'active',
      deletedAt: null,
    })
  })

  it('reads numerics that arrive as strings', () => {
    const parsed = parseProductLiveEvent({ ...PAYLOAD, kenyon_price: '199.90', full_price: '250' })
    expect(parsed?.kenyonPrice).toBe(199.9)
    expect(parsed?.fullPrice).toBe(250)
  })

  it('keeps an untracked product untracked', () => {
    const parsed = parseProductLiveEvent({ ...PAYLOAD, stock_quantity: null, available: null })
    expect(parsed?.stockQuantity).toBeNull()
    expect(parsed?.available).toBeNull()
  })

  it('refuses anything that is not the trigger payload', () => {
    expect(parseProductLiveEvent(null)).toBeNull()
    expect(parseProductLiveEvent('live')).toBeNull()
    expect(parseProductLiveEvent({})).toBeNull()
    expect(parseProductLiveEvent({ ...PAYLOAD, product_id: 42 })).toBeNull()
    expect(parseProductLiveEvent({ ...PAYLOAD, status: null })).toBeNull()
    expect(parseProductLiveEvent({ ...PAYLOAD, stock_quantity: 'seven' })).toBeNull()
    expect(parseProductLiveEvent({ ...PAYLOAD, deleted_at: 12 })).toBeNull()
    const { stock_quantity: _dropped, ...noStock } = PAYLOAD
    expect(parseProductLiveEvent(noStock)).toBeNull()
  })
})

describe('applyProductLiveEvent', () => {
  const base = initialProductLiveState({ stock: 10, price: 150, oldPrice: 200 })
  const event = parseProductLiveEvent(PAYLOAD)
  if (!event) throw new Error('fixture must parse')

  it('starts from the cached values and is not live yet', () => {
    expect(base).toEqual({ stock: 10, price: 150, oldPrice: 200, onSale: true, live: false })
  })

  it('prefers the reservation-aware level over the raw shelf', () => {
    const next = applyProductLiveEvent(base, event, ID)
    expect(next.stock).toBe(5)
    expect(next.live).toBe(true)
  })

  it('falls back to the shelf level when the trigger could not subtract holds', () => {
    const next = applyProductLiveEvent(base, { ...event, available: null }, ID)
    expect(next.stock).toBe(7)
  })

  it('moves the price and the strike-through together', () => {
    const next = applyProductLiveEvent(base, event, ID)
    expect(next.price).toBe(199)
    expect(next.oldPrice).toBe(299)
  })

  it('drops the strike-through when the compare-at no longer exceeds the price', () => {
    const next = applyProductLiveEvent(base, { ...event, fullPrice: 199 }, ID)
    expect(next.oldPrice).toBeNull()
  })

  it('keeps the last known price when the row is mid-edit at zero', () => {
    const next = applyProductLiveEvent(base, { ...event, kenyonPrice: 0 }, ID)
    expect(next.price).toBe(150)
    const nulled = applyProductLiveEvent(base, { ...event, kenyonPrice: null }, ID)
    expect(nulled.price).toBe(150)
  })

  it('withdraws the product when it leaves active or is soft-deleted', () => {
    expect(applyProductLiveEvent(base, { ...event, status: 'draft' }, ID).onSale).toBe(false)
    expect(
      applyProductLiveEvent(base, { ...event, deletedAt: '2026-09-16T00:00:00Z' }, ID).onSale,
    ).toBe(false)
    expect(applyProductLiveEvent(base, event, ID).onSale).toBe(true)
  })

  it('ignores a message about another product even on the same channel', () => {
    const other = { ...event, productId: '22222222-2222-4222-8222-222222222222' }
    expect(applyProductLiveEvent(base, other, ID)).toBe(base)
  })

  it('names the topic the trigger sends on', () => {
    expect(productLiveTopic(ID)).toBe(`product:${ID}`)
  })
})
