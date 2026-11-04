import { lineQuantityCeiling, unavailableMessage } from '@/lib/cart/format'
import { buildCartView, maxPerOrderOf } from '@/lib/cart/pricing'
import type { CartStorageItem, CartView, CartViewItem } from '@/lib/cart/types'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { agorot } from '@/lib/money'
import { anyZoneCharges, quoteShipping } from '@/lib/shipping/zones'
import { describe, expect, it } from 'vitest'

/**
 * S06: the cart rules end to end, as one file a reviewer can read top to
 * bottom. The pricer, the checkout gate and the shipping policy each have
 * their own suites; this one pins the rules that span them:
 *
 *   - the line state machine (available / each unavailable reason),
 *   - agorot integrality of every total on a mixed cart,
 *   - coupon + physical mixing (allowed; address iff physical),
 *   - shipping is zero for every product today,
 *   - there is no minimum order,
 *   - `products.max_per_order` is enforced (it was not, before S06).
 */

type ProductRow = Parameters<typeof buildCartView>[2][number]
type VariantRow = Parameters<typeof buildCartView>[3][number]

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p1',
    slug: 'p1',
    name_he: 'מוצר',
    type: 'physical',
    kenyon_price: 100,
    stock_quantity: 50,
    status: 'active',
    deleted_at: null,
    images: [],
    is_coupon_enabled: false,
    platform_percent: 10,
    coupon_price_ils: null,
    cashback_percent: 0,
    ...overrides,
  }
}

const coupon = (overrides: Partial<ProductRow> = {}) =>
  product({
    id: 'c1',
    slug: 'c1',
    type: 'coupon',
    kenyon_price: 199.9,
    coupon_price_ils: 49.9,
    platform_percent: 15,
    ...overrides,
  })

function variant(overrides: Partial<VariantRow> = {}): VariantRow {
  return {
    id: 'v1',
    product_id: 'p1',
    price: null,
    price_modifier: 0,
    stock_quantity: null,
    is_active: true,
    deleted_at: null,
    ...overrides,
  }
}

function stored(overrides: Partial<CartStorageItem> = {}): CartStorageItem {
  return { product_id: 'p1', variant_id: null, quantity: 1, ...overrides }
}

function line(cart: CartView, productId: string, variantId: string | null = null): CartViewItem {
  const item = cart.items.find((i) => i.product_id === productId && i.variant_id === variantId)
  if (!item) throw new Error(`no line for ${productId}/${variantId}`)
  return item
}

function allMoney(cart: CartView): number[] {
  return [
    cart.subtotal,
    cart.platform_fee,
    cart.supplier_due,
    cart.balance_due_at_business,
    cart.discount,
    cart.total,
    ...cart.items.flatMap((i) => [
      i.unit_price,
      i.line_total,
      i.platform_fee,
      i.supplier_due,
      i.customer_pays_now,
      i.balance_due_at_business,
      ...(i.coupon_price_unit === null ? [] : [i.coupon_price_unit]),
    ]),
  ]
}

describe('S06 line state machine', () => {
  it('walks every reason in its documented precedence', () => {
    const cart = buildCartView(
      'c',
      [
        stored({ product_id: 'ok' }),
        stored({ product_id: 'gone' }),
        stored({ product_id: 'unpriced' }),
        stored({ product_id: 'empty' }),
        stored({ product_id: 'short', quantity: 4 }),
        stored({ product_id: 'capped', quantity: 6 }),
      ],
      [
        product({ id: 'ok' }),
        product({ id: 'gone', status: 'draft' }),
        product({ id: 'unpriced', platform_percent: null }),
        product({ id: 'empty', stock_quantity: 0 }),
        product({ id: 'short', stock_quantity: 3 }),
        product({ id: 'capped', max_per_order: 5 }),
      ],
      [],
    )

    expect(cart.items.map((i) => [i.product_id, i.unavailable_reason])).toEqual([
      ['ok', null],
      ['gone', 'delisted'],
      ['unpriced', 'unpriced'],
      ['empty', 'out_of_stock'],
      ['short', 'insufficient_stock'],
      ['capped', 'over_limit'],
    ])
    expect(cart.items.map((i) => i.available)).toEqual([true, false, false, false, false, false])
  })

  it('a delisted product outranks the per-order limit', () => {
    const cart = buildCartView(
      'c',
      [stored({ quantity: 9 })],
      [product({ status: 'archived', max_per_order: 5 })],
      [],
    )
    expect(line(cart, 'p1').unavailable_reason).toBe('delisted')
  })

  it('checkout refuses an empty cart and any unavailable line', () => {
    const empty = validateCartView(buildCartView(null, [], [], []))
    expect(empty.ok).toBe(false)
    expect(empty.issues.map((i) => i.code)).toEqual(['EMPTY'])

    const capped = validateCartView(
      buildCartView('c', [stored({ quantity: 6 })], [product({ max_per_order: 5 })], []),
    )
    expect(capped.ok).toBe(false)
    expect(capped.issues.map((i) => i.code)).toEqual(['UNAVAILABLE'])
  })
})

describe('S06 agorot totals', () => {
  // Prices with fractional shekels on purpose: 49.90 and 199.90 are where a
  // float path shows up as 4989.999...
  const cart = buildCartView(
    'c',
    [stored({ quantity: 3 }), stored({ product_id: 'c1', quantity: 2 })],
    [product({ kenyon_price: 33.33 }), coupon()],
    [],
    { code: 'TEN', label: '10', discountAgorot: 1_000 },
  )

  it('every money field on a mixed, discounted cart is a safe integer', () => {
    for (const value of allMoney(cart)) expect(Number.isSafeInteger(value)).toBe(true)
  })

  it('physical charges face, coupon charges its absolute price, both in agorot', () => {
    expect(line(cart, 'p1').unit_price).toBe(3_333)
    expect(line(cart, 'p1').customer_pays_now).toBe(9_999)
    expect(line(cart, 'c1').coupon_price_unit).toBe(4_990)
    expect(line(cart, 'c1').customer_pays_now).toBe(9_980)
    expect(line(cart, 'c1').balance_due_at_business).toBe(2 * (19_990 - 4_990))
  })

  it('subtotal is the sum of what each line charges now, and total is subtotal - discount', () => {
    const sum = cart.items.reduce((s, i) => s + i.customer_pays_now, 0)
    expect(cart.subtotal).toBe(sum)
    expect(cart.subtotal).toBe(9_999 + 9_980)
    expect(cart.discount).toBe(1_000)
    expect(cart.total).toBe(cart.subtotal - cart.discount)
  })

  it('caps a discount larger than the cart at the cart, never below zero', () => {
    const big = buildCartView('c', [stored()], [product()], [], {
      code: 'BIG',
      label: 'big',
      discountAgorot: 1_000_000,
    })
    expect(big.discount).toBe(10_000)
    expect(big.total).toBe(agorot(0))
  })
})

describe('S06 coupon vs physical mixing', () => {
  it('a mixed cart is allowed and requires an address because of the physical line', () => {
    const v = validateCartView(
      buildCartView('c', [stored(), stored({ product_id: 'c1' })], [product(), coupon()], []),
    )
    expect(v.ok).toBe(true)
    expect(v.hasPhysical).toBe(true)
    expect(v.hasCoupon).toBe(true)
    expect(v.requiresAddress).toBe(true)
  })

  it('a coupon-only cart never asks for a shipping address', () => {
    const v = validateCartView(buildCartView('c', [stored({ product_id: 'c1' })], [coupon()], []))
    expect(v.ok).toBe(true)
    expect(v.requiresAddress).toBe(false)
  })

  it('a physical product flagged is_coupon_enabled is sold as a coupon', () => {
    const cart = buildCartView(
      'c',
      [stored()],
      [product({ is_coupon_enabled: true, coupon_price_ils: 20 })],
      [],
    )
    expect(line(cart, 'p1').type).toBe('coupon')
    expect(validateCartView(cart).requiresAddress).toBe(false)
  })

  it('the coupon line keeps the whole prepayment, the physical line splits by percent', () => {
    const cart = buildCartView(
      'c',
      [stored(), stored({ product_id: 'c1' })],
      [product(), coupon()],
      [],
    )
    expect(line(cart, 'p1').platform_fee).toBe(1_000)
    expect(line(cart, 'p1').supplier_due).toBe(9_000)
    expect(line(cart, 'c1').platform_fee).toBe(4_990)
    expect(line(cart, 'c1').supplier_due).toBe(0)
    expect(cart.platform_fee).toBe(5_990)
  })
})

describe('S06 shipping fee per product', () => {
  it('the cart view carries no shipping line at all', () => {
    const cart = buildCartView('c', [stored()], [product()], [])
    expect(Object.keys(cart)).not.toContain('shipping')
    expect(cart.total).toBe(cart.subtotal)
  })

  it('every zone quotes zero for any subtotal, matching "משלוח מהיר חינם"', () => {
    expect(anyZoneCharges()).toBe(false)
    for (const zone of ['center', 'north', 'south']) {
      const quote = quoteShipping({ zone, subtotalAgorot: agorot(100) })
      if (quote.ok) expect(quote.amountAgorot).toBe(0)
    }
  })
})

describe('S06 minimum order is zero', () => {
  it('a one-agora cart passes the checkout gate', () => {
    const cart = buildCartView('c', [stored()], [product({ kenyon_price: 0.01 })], [])
    expect(cart.total).toBe(1)
    expect(validateCartView(cart).ok).toBe(true)
  })
})

describe('S06 max_per_order', () => {
  it('parses only a positive limit; zero, negatives and junk mean no limit', () => {
    expect(maxPerOrderOf(5)).toBe(5)
    expect(maxPerOrderOf('10')).toBe(10)
    expect(maxPerOrderOf(2.7)).toBe(2)
    for (const v of [null, undefined, 0, -1, 'x', Number.NaN]) expect(maxPerOrderOf(v)).toBeNull()
  })

  it('a line exactly at the limit is fine, one over is over_limit', () => {
    const at = buildCartView('c', [stored({ quantity: 5 })], [product({ max_per_order: 5 })], [])
    expect(line(at, 'p1').available).toBe(true)
    expect(line(at, 'p1').max_quantity).toBe(5)

    const over = buildCartView('c', [stored({ quantity: 6 })], [product({ max_per_order: 5 })], [])
    expect(line(over, 'p1').unavailable_reason).toBe('over_limit')
    expect(unavailableMessage(line(over, 'p1'))).toBe(
      'ניתן להזמין עד 5 יחידות — הפחיתו את הכמות כדי להמשיך',
    )
    expect(lineQuantityCeiling(line(over, 'p1'))).toBe(5)
  })

  it('the limit is per product, shared across its variant lines', () => {
    const cart = buildCartView(
      'c',
      [stored({ variant_id: 'v1', quantity: 3 }), stored({ variant_id: 'v2', quantity: 3 })],
      [product({ max_per_order: 5 })],
      [variant({ id: 'v1' }), variant({ id: 'v2' })],
    )
    // 6 units of a product capped at 5: each line has room for 5 - 3 = 2.
    expect(line(cart, 'p1', 'v1').unavailable_reason).toBe('over_limit')
    expect(line(cart, 'p1', 'v1').max_quantity).toBe(2)
    expect(validateCartView(cart).ok).toBe(false)
  })

  it('reports whichever ceiling is lower, stock or limit', () => {
    const shelfLower = buildCartView(
      'c',
      [stored({ quantity: 8 })],
      [product({ max_per_order: 5, stock_quantity: 3 })],
      [],
    )
    expect(line(shelfLower, 'p1').unavailable_reason).toBe('insufficient_stock')
    expect(line(shelfLower, 'p1').max_quantity).toBe(3)

    const limitLower = buildCartView(
      'c',
      [stored({ quantity: 8 })],
      [product({ max_per_order: 5, stock_quantity: 7 })],
      [],
    )
    expect(line(limitLower, 'p1').unavailable_reason).toBe('over_limit')
    expect(line(limitLower, 'p1').max_quantity).toBe(5)
  })

  it('no limit on the row leaves the 99 cap alone', () => {
    const cart = buildCartView(
      'c',
      [stored({ quantity: 40 })],
      [product({ stock_quantity: null })],
      [],
    )
    expect(line(cart, 'p1').available).toBe(true)
    expect(line(cart, 'p1').max_quantity).toBeNull()
    expect(lineQuantityCeiling(line(cart, 'p1'))).toBe(99)
  })
})
