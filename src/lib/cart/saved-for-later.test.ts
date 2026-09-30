import {
  SAVED_FOR_LATER_KEY,
  SAVED_FOR_LATER_MAX,
  type SavedItem,
  createSavedForLaterStore,
  isSavedItem,
  savedItemFromLine,
} from '@/lib/cart/saved-for-later'
import type { CartViewItem } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { beforeEach, describe, expect, it } from 'vitest'

function line(overrides: Partial<CartViewItem> = {}): CartViewItem {
  return {
    product_id: 'p1',
    variant_id: null,
    quantity: 2,
    name_he: 'מוצר',
    slug: 'p1',
    image_url: null,
    unit_price: agorot(10_000),
    line_total: agorot(20_000),
    type: 'physical',
    available: true,
    platform_fee: agorot(2_000),
    supplier_due: agorot(18_000),
    customer_pays_now: agorot(20_000),
    balance_due_at_business: agorot(0),
    cashback: agorot(0),
    platform_percent_bp: 1000,
    platform_percent_snapshot: 10,
    coupon_price_unit: null,
    max_quantity: null,
    unavailable_reason: null,
    ...overrides,
  }
}

function saved(overrides: Partial<SavedItem> = {}): SavedItem {
  return { ...savedItemFromLine(line(), 1_000), ...overrides }
}

beforeEach(() => {
  localStorage.clear()
})

describe('savedItemFromLine', () => {
  it('keeps identity, quantity and display fields and nothing about the money split', () => {
    const item = savedItemFromLine(line(), 42)
    expect(item).toEqual({
      product_id: 'p1',
      variant_id: null,
      quantity: 2,
      name_he: 'מוצר',
      slug: 'p1',
      image_url: null,
      unit_price: 10_000,
      saved_at: 42,
    })
    expect(item).not.toHaveProperty('platform_fee')
  })
})

describe('createSavedForLaterStore', () => {
  it('save puts the newest row first and replaces a row with the same identity', () => {
    const store = createSavedForLaterStore()
    store.getState().save(saved({ product_id: 'a', saved_at: 1 }))
    store.getState().save(saved({ product_id: 'b', saved_at: 2 }))
    store.getState().save(saved({ product_id: 'a', quantity: 5, saved_at: 3 }))
    expect(store.getState().items.map((entry) => [entry.product_id, entry.quantity])).toEqual([
      ['a', 5],
      ['b', 2],
    ])
  })

  it('a variant is a different identity from its parent product', () => {
    const store = createSavedForLaterStore()
    store.getState().save(saved({ product_id: 'a', variant_id: null }))
    store.getState().save(saved({ product_id: 'a', variant_id: 'v1' }))
    expect(store.getState().items).toHaveLength(2)
    expect(store.getState().has('a', 'v1')).toBe(true)
    store.getState().discard('a', 'v1')
    expect(store.getState().has('a', 'v1')).toBe(false)
    expect(store.getState().has('a', null)).toBe(true)
  })

  it('take returns the row and removes it; a second take is null', () => {
    const store = createSavedForLaterStore([saved({ product_id: 'a' })])
    expect(store.getState().take('a', null)?.product_id).toBe('a')
    expect(store.getState().items).toEqual([])
    expect(store.getState().take('a', null)).toBeNull()
  })

  it('caps the list at the maximum, dropping the oldest', () => {
    const store = createSavedForLaterStore()
    for (let i = 0; i < SAVED_FOR_LATER_MAX + 5; i++) {
      store.getState().save(saved({ product_id: `p${i}`, saved_at: i }))
    }
    const items = store.getState().items
    expect(items).toHaveLength(SAVED_FOR_LATER_MAX)
    expect(items[0]?.product_id).toBe(`p${SAVED_FOR_LATER_MAX + 4}`)
    expect(items.some((entry) => entry.product_id === 'p0')).toBe(false)
  })

  it('persists only the rows, and a second store reads them back after rehydrate', async () => {
    const first = createSavedForLaterStore()
    first.getState().save(saved({ product_id: 'a' }))
    const raw = localStorage.getItem(SAVED_FOR_LATER_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).state).toEqual({ items: first.getState().items })

    const second = createSavedForLaterStore()
    expect(second.getState().items).toEqual([])
    await second.persist.rehydrate()
    expect(second.getState().items.map((entry) => entry.product_id)).toEqual(['a'])
  })

  it('drops persisted rows it cannot trust instead of rendering them with holes', async () => {
    localStorage.setItem(
      SAVED_FOR_LATER_KEY,
      JSON.stringify({
        state: {
          items: [
            saved({ product_id: 'good' }),
            { product_id: 'float', unit_price: 12.5 },
            'garbage',
            saved({ product_id: 'zero-qty', quantity: 0 }),
          ],
        },
        version: 0,
      }),
    )
    const store = createSavedForLaterStore()
    await store.persist.rehydrate()
    expect(store.getState().items.map((entry) => entry.product_id)).toEqual(['good'])
  })

  it('starts unhydrated and is marked by the provider, never by itself', () => {
    const store = createSavedForLaterStore()
    expect(store.getState().hydrated).toBe(false)
    store.getState().markHydrated()
    expect(store.getState().hydrated).toBe(true)
  })
})

describe('isSavedItem', () => {
  it('requires integer agorot and a positive integer quantity', () => {
    expect(isSavedItem(saved())).toBe(true)
    expect(isSavedItem(saved({ unit_price: 10.5 as never }))).toBe(false)
    expect(isSavedItem(saved({ quantity: 1.5 }))).toBe(false)
    expect(isSavedItem(saved({ product_id: '' }))).toBe(false)
    expect(isSavedItem(null)).toBe(false)
    expect(isSavedItem([])).toBe(false)
  })
})
