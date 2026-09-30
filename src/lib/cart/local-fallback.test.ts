import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CART_FALLBACK_KEY,
  CART_FALLBACK_MAX_AGE_MS,
  clearCartFallback,
  isFallbackCart,
  readCartFallback,
  writeCartFallback,
} from './local-fallback'

/**
 * The line fallback is the second cart key in the browser, and the rules it
 * has to keep are about what it may NOT do: never resurrect an emptied cart,
 * never show a snapshot older than the row it describes, never "repair" a
 * shape it does not recognise, and never throw where the cart on screen
 * would be the casualty.
 */

function item(overrides: Partial<CartViewItem> = {}): CartViewItem {
  return {
    product_id: 'p1',
    variant_id: null,
    quantity: 2,
    name_he: 'מוצר',
    slug: 'p1',
    image_url: null,
    unit_price: agorot(100),
    line_total: agorot(200),
    type: 'physical',
    available: true,
    platform_fee: agorot(10),
    supplier_due: agorot(90),
    customer_pays_now: agorot(100),
    balance_due_at_business: agorot(0),
    cashback: agorot(0),
    platform_percent_bp: 500,
    platform_percent_snapshot: 5,
    coupon_price_unit: null,
    max_quantity: null,
    unavailable_reason: null,
    ...overrides,
  }
}

function cart(items: CartViewItem[]): CartView {
  const subtotal = items.reduce((s, i) => s + i.line_total, 0)
  return {
    ...EMPTY_CART,
    id: 'cart-1',
    items,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: agorot(subtotal),
    total: agorot(subtotal),
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('writeCartFallback', () => {
  it('keeps the confirmed cart under its own key, apart from the mirror', () => {
    writeCartFallback(cart([item()]), 1_000)
    const raw = localStorage.getItem(CART_FALLBACK_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toMatchObject({ v: 1, saved_at: 1_000 })
    expect(localStorage.getItem('ke_cart_mirror_v1')).toBeNull()
  })

  it('removes the key on an empty cart rather than leaving the old lines behind', () => {
    writeCartFallback(cart([item()]))
    writeCartFallback(EMPTY_CART)
    expect(localStorage.getItem(CART_FALLBACK_KEY)).toBeNull()
    expect(readCartFallback()).toBeNull()
  })

  it('swallows a storage that refuses the write', () => {
    const setItem = localStorage.setItem
    localStorage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    try {
      expect(() => writeCartFallback(cart([item()]))).not.toThrow()
    } finally {
      localStorage.setItem = setItem
    }
  })
})

describe('readCartFallback', () => {
  it('returns what was written, lines and totals intact', () => {
    const written = cart([item(), item({ product_id: 'p2', variant_id: 'v1', quantity: 1 })])
    writeCartFallback(written, 5_000)
    expect(readCartFallback(6_000)).toEqual(written)
  })

  it('is null when nothing was ever written', () => {
    expect(readCartFallback()).toBeNull()
  })

  it('refuses a snapshot older than the cart row it describes, and drops it', () => {
    writeCartFallback(cart([item()]), 0)
    expect(readCartFallback(CART_FALLBACK_MAX_AGE_MS + 1)).toBeNull()
    expect(localStorage.getItem(CART_FALLBACK_KEY)).toBeNull()
  })

  it('accepts a snapshot right at the age limit', () => {
    writeCartFallback(cart([item()]), 0)
    expect(readCartFallback(CART_FALLBACK_MAX_AGE_MS)).not.toBeNull()
  })

  it('refuses a snapshot from the future, which is a clock that cannot be trusted', () => {
    writeCartFallback(cart([item()]), 10_000)
    expect(readCartFallback(9_000)).toBeNull()
  })

  it('drops unparseable content instead of throwing', () => {
    localStorage.setItem(CART_FALLBACK_KEY, '{not json')
    expect(readCartFallback()).toBeNull()
    expect(localStorage.getItem(CART_FALLBACK_KEY)).toBeNull()
  })

  it('drops an envelope from another version', () => {
    localStorage.setItem(
      CART_FALLBACK_KEY,
      JSON.stringify({ v: 2, saved_at: Date.now(), cart: cart([item()]) }),
    )
    expect(readCartFallback()).toBeNull()
  })

  it('drops a cart whose money is not integer agorot', () => {
    const bad = cart([item()])
    localStorage.setItem(
      CART_FALLBACK_KEY,
      JSON.stringify({ v: 1, saved_at: Date.now(), cart: { ...bad, subtotal: 12.5 } }),
    )
    expect(readCartFallback()).toBeNull()
  })

  it('drops a cart with a line it could not render', () => {
    const bad = cart([item()])
    const lines = [{ ...item(), name_he: undefined }]
    localStorage.setItem(
      CART_FALLBACK_KEY,
      JSON.stringify({ v: 1, saved_at: Date.now(), cart: { ...bad, items: lines } }),
    )
    expect(readCartFallback()).toBeNull()
  })

  it('drops an empty snapshot, which has nothing to show', () => {
    localStorage.setItem(
      CART_FALLBACK_KEY,
      JSON.stringify({ v: 1, saved_at: Date.now(), cart: EMPTY_CART }),
    )
    expect(readCartFallback()).toBeNull()
  })
})

describe('isFallbackCart', () => {
  it('accepts the shape the pricer produces', () => {
    expect(isFallbackCart(cart([item()]))).toBe(true)
    expect(isFallbackCart(EMPTY_CART)).toBe(true)
  })

  it('rejects everything that is not a cart', () => {
    for (const value of [null, undefined, 3, 'cart', [], {}, { items: 'x' }]) {
      expect(isFallbackCart(value)).toBe(false)
    }
  })

  it('rejects a line with a non-positive or fractional quantity', () => {
    expect(isFallbackCart(cart([item({ quantity: 0 })]))).toBe(false)
    expect(isFallbackCart(cart([item({ quantity: 1.5 })]))).toBe(false)
  })
})

describe('clearCartFallback', () => {
  it('removes the key and is safe to call twice', () => {
    writeCartFallback(cart([item()]))
    clearCartFallback()
    clearCartFallback()
    expect(localStorage.getItem(CART_FALLBACK_KEY)).toBeNull()
  })
})
