import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem, CartView, CartViewItem } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'

/**
 * `buildCartView` is the only place the catalogue's shekel columns become the
 * agorot the rest of the cart is built on, and it had no test of its own.
 *
 * It shipped for a while dividing every result by 100 on the way out, so a
 * `CartView` whose type says "integer agorot" actually carried floats in
 * shekels. Nothing caught it, because the four components rendering those
 * numbers each had a private formatter that assumed shekels, and two wrongs
 * agreed on screen. The moment the division was removed the display was
 * overstated 100x, which is the failure this file exists to prevent from
 * happening again in either direction.
 *
 * So the assertions below are deliberately about scale and integrality, not
 * only about ratios: a test that checked `platformFee / subtotal === 0.1`
 * would have passed happily through the entire bug.
 */

type ProductRow = Parameters<typeof buildCartView>[2][number]
type VariantRow = Parameters<typeof buildCartView>[3][number]

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p1',
    slug: 'p1',
    name_he: 'מוצר',
    type: 'physical',
    // Shekels, as the `numeric` column stores it. ₪100.00.
    kenyon_price: 100,
    stock_quantity: 50,
    status: 'active',
    deleted_at: null,
    images: ['https://cdn.example/p1.jpg'],
    is_coupon_enabled: false,
    platform_percent: 10,
    coupon_price_ils: null,
    cashback_percent: 0,
    ...overrides,
  }
}

function stored(overrides: Partial<CartStorageItem> = {}): CartStorageItem {
  return { product_id: 'p1', variant_id: null, quantity: 1, ...overrides }
}

/**
 * The line at `index`, or a failure naming what was actually built.
 *
 * Indexing `cart.items[0]` directly is a type error under the strict index
 * checks this repo compiles with, and silencing it with `!` would turn "the
 * cart dropped the line" into an unreadable "cannot read property of
 * undefined".
 */
function line(cart: CartView, index = 0): CartViewItem {
  const item = cart.items[index]
  if (!item) {
    throw new Error(`expected a line at ${index}, got ${cart.items.length} item(s)`)
  }
  return item
}

/** Every money field on the view, flattened, for the integrality sweep. */
function allMoney(cart: CartView): number[] {
  const lineFields = (i: CartViewItem) => [
    i.unit_price,
    i.line_total,
    i.platform_fee,
    i.supplier_due,
    i.customer_pays_now,
    i.balance_due_at_business,
    ...(i.coupon_price_unit === null ? [] : [i.coupon_price_unit]),
  ]
  return [
    cart.subtotal,
    cart.platform_fee,
    cart.supplier_due,
    cart.balance_due_at_business,
    cart.discount,
    cart.total,
    ...(cart.coupon ? [cart.coupon.discount] : []),
    ...cart.items.flatMap(lineFields),
  ]
}

describe('buildCartView: physical lines', () => {
  it('prices a physical line in agorot, not shekels', () => {
    const cart = buildCartView('cart-1', [stored({ quantity: 2 })], [product()], [])

    // ₪100.00 a unit, two of them. The bug this asserts against returned 200.
    expect(line(cart).unit_price).toBe(10_000)
    expect(line(cart).line_total).toBe(20_000)
    expect(cart.subtotal).toBe(20_000)
    expect(cart.total).toBe(20_000)
  })

  it('splits the line at the product percent and settles the residual', () => {
    const cart = buildCartView('cart-1', [stored({ quantity: 2 })], [product()], [])

    // 10% of ₪200.00.
    expect(cart.platform_fee).toBe(2_000)
    expect(cart.supplier_due).toBe(18_000)
    // A physical line is paid in full on site; nothing is left for the counter.
    expect(cart.balance_due_at_business).toBe(0)
    expect(line(cart).platform_percent_bp).toBe(1_000)
  })

  it('charges the customer the full face value', () => {
    const cart = buildCartView('cart-1', [stored()], [product()], [])
    expect(line(cart).customer_pays_now).toBe(10_000)
    expect(line(cart).balance_due_at_business).toBe(0)
  })
})

describe('buildCartView: coupon lines', () => {
  const couponProduct = product({
    id: 'c1',
    slug: 'c1',
    type: 'coupon',
    kenyon_price: 200,
    coupon_price_ils: 50,
  })

  it('charges the admin-set absolute coupon price on site, not a percent', () => {
    const cart = buildCartView('cart-1', [stored({ product_id: 'c1' })], [couponProduct], [])

    expect(line(cart).coupon_price_unit).toBe(5_000)
    expect(line(cart).customer_pays_now).toBe(5_000)
    expect(cart.subtotal).toBe(5_000)
    // Face is ₪200.00, so ₪150.00 is still owed across the counter.
    expect(line(cart).balance_due_at_business).toBe(15_000)
    expect(cart.balance_due_at_business).toBe(15_000)
  })

  it('keeps the whole prepayment and reports the rate that actually applied', () => {
    const cart = buildCartView('cart-1', [stored({ product_id: 'c1' })], [couponProduct], [])

    // The platform keeps all of it; the supplier is owed nothing BY US.
    expect(cart.platform_fee).toBe(5_000)
    expect(cart.supplier_due).toBe(0)
    // Not the product's configured 10%: that split did not happen.
    expect(line(cart).platform_percent_bp).toBe(10_000)
  })

  it('multiplies the coupon price by quantity', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ product_id: 'c1', quantity: 3 })],
      [couponProduct],
      [],
    )
    expect(cart.subtotal).toBe(15_000)
    expect(cart.balance_due_at_business).toBe(45_000)
  })
})

describe('buildCartView: unpriceable lines', () => {
  it('marks a product with no platform percent unavailable and keeps it out of the money', () => {
    const cart = buildCartView(
      'cart-1',
      [stored(), stored({ product_id: 'p2' })],
      [product(), product({ id: 'p2', slug: 'p2', platform_percent: null })],
      [],
    )

    const broken = cart.items.find((i) => i.product_id === 'p2')
    expect(broken?.available).toBe(false)
    // Only the priceable line reached the engine, so no percent was invented.
    expect(cart.subtotal).toBe(10_000)
    expect(cart.platform_fee).toBe(1_000)
  })

  it('marks a coupon with no absolute price unavailable rather than deriving one', () => {
    const cart = buildCartView(
      'cart-1',
      [stored(), stored({ product_id: 'c2' })],
      [product(), product({ id: 'c2', slug: 'c2', type: 'coupon', coupon_price_ils: null })],
      [],
    )

    const broken = cart.items.find((i) => i.product_id === 'c2')
    expect(broken?.available).toBe(false)
    expect(broken?.coupon_price_unit).toBeNull()
    expect(cart.subtotal).toBe(10_000)
  })

  it('marks a line unavailable when stock cannot cover the quantity', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ quantity: 5 })],
      [product({ stock_quantity: 2 })],
      [],
    )
    expect(line(cart).available).toBe(false)
  })
})

describe('buildCartView: discounts', () => {
  it('takes the discount off the on-site charge', () => {
    const cart = buildCartView('cart-1', [stored()], [product()], [], {
      code: 'SAVE10',
      label: '₪10 הנחה',
      discountAgorot: 1_000,
    })

    expect(cart.discount).toBe(1_000)
    expect(cart.coupon).toEqual({ code: 'SAVE10', label: '₪10 הנחה', discount: 1_000 })
    expect(cart.subtotal).toBe(10_000)
    expect(cart.total).toBe(9_000)
  })

  it('caps a code larger than the cart so the quote cannot go negative', () => {
    const cart = buildCartView('cart-1', [stored()], [product()], [], {
      code: 'HUGE',
      label: 'הנחה גדולה',
      discountAgorot: 999_999,
    })

    expect(cart.discount).toBe(10_000)
    expect(cart.total).toBe(0)
  })
})

describe('buildCartView: the agorot invariant', () => {
  it('returns integers for every money field on a mixed cart', () => {
    const cart = buildCartView(
      'cart-1',
      [
        // 3 x ₪33.33 forces a rounding decision inside the engine.
        stored({ product_id: 'odd', quantity: 3 }),
        stored({ product_id: 'c1' }),
      ],
      [
        product({ id: 'odd', slug: 'odd', kenyon_price: 33.33, platform_percent: 7 }),
        product({
          id: 'c1',
          slug: 'c1',
          type: 'coupon',
          kenyon_price: 200,
          coupon_price_ils: 49.5,
        }),
      ],
      [],
    )

    for (const value of allMoney(cart)) {
      expect(Number.isInteger(value), `${value} is not an integer number of agorot`).toBe(true)
    }
  })

  it('keeps the platform and supplier shares adding up to what was charged', () => {
    const cart = buildCartView('cart-1', [stored({ quantity: 3 })], [product()], [])
    expect(agorot(cart.platform_fee + cart.supplier_due)).toBe(cart.subtotal)
  })
})

describe('buildCartView: line identity', () => {
  it('carries the stored platform percent snapshot through untouched', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ platform_percent_snapshot: 22 })],
      // The catalogue says 10 now; the line was added when it said 22.
      [product()],
      [],
    )
    expect(line(cart).platform_percent_snapshot).toBe(22)
    expect(line(cart).platform_percent_bp).toBe(1_000)
  })

  it('drops a stored line whose product no longer exists', () => {
    const cart = buildCartView(
      'cart-1',
      [stored(), stored({ product_id: 'gone' })],
      [product()],
      [],
    )
    expect(cart.items).toHaveLength(1)
    expect(cart.item_count).toBe(1)
  })

  it('counts every unit across lines', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ quantity: 2 }), stored({ product_id: 'p2', quantity: 3 })],
      [product(), product({ id: 'p2', slug: 'p2' })],
      [],
    )
    expect(cart.item_count).toBe(5)
  })
})

describe('buildCartView: variants', () => {
  function variant(overrides: Partial<VariantRow> = {}): VariantRow {
    return {
      id: 'v1',
      product_id: 'p1',
      price: null,
      price_modifier: 0,
      stock_quantity: 10,
      is_active: true,
      deleted_at: null,
      ...overrides,
    }
  }

  it('prices a variant override in agorot', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ variant_id: 'v1' })],
      [product()],
      [variant({ price: 250 })],
    )
    expect(line(cart).unit_price).toBe(25_000)
  })

  it('adds the variant modifier to the product price', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ variant_id: 'v1' })],
      [product()],
      [variant({ price_modifier: 15 })],
    )
    expect(line(cart).unit_price).toBe(11_500)
  })

  it('drops a line whose variant belongs to another product', () => {
    const cart = buildCartView(
      'cart-1',
      [stored({ variant_id: 'v1' })],
      [product()],
      [variant({ product_id: 'other' })],
    )
    expect(cart.items).toHaveLength(0)
  })
})

describe('buildCartView: empty', () => {
  it('returns the empty cart with its id when nothing is stored', () => {
    const cart = buildCartView('cart-1', [], [], [])
    expect(cart.id).toBe('cart-1')
    expect(cart.items).toHaveLength(0)
    expect(cart.subtotal).toBe(0)
    expect(cart.total).toBe(0)
  })
})

/**
 * `products.type` is a Postgres enum with three values in production today
 * (`coupon`, `physical`, `service`) and a fourth, `recurring`, waiting in
 * PENDING-109. The cart prices two of them.
 *
 * The resolver used to end in `: 'physical'`, so every value it did not
 * recognise was priced as a one-time physical purchase. That is silent by
 * construction: the row type claimed only two values could arrive, so the
 * compiler never asked about the third, and a subscription would have been
 * charged once at its physical price with a green suite.
 *
 * These tests assert the refusal, not the fallback.
 */
describe('buildCartView: a type the cart cannot price', () => {
  it('refuses a service line instead of selling it as physical', () => {
    // Mixed with a priceable line, because a cart of nothing but unpriceable
    // lines short-circuits to EMPTY_CART and would hide the per-line result.
    const cart = buildCartView(
      'cart-1',
      [stored({ product_id: 'ok' }), stored({ product_id: 'svc' })],
      [product({ id: 'ok', slug: 'ok' }), product({ id: 'svc', slug: 'svc', type: 'service' })],
      [],
    )

    const service = cart.items.find((i) => i.product_id === 'svc')
    expect(service?.available).toBe(false)
    // Kept out of the money engine entirely, not priced at zero commission.
    expect(service?.platform_fee).toBe(0)
    expect(service?.supplier_due).toBe(0)
    expect(service?.customer_pays_now).toBe(0)

    // And it contributes nothing to the totals: ₪100 for the one good line.
    expect(cart.subtotal).toBe(agorot(10000))
  })

  it('drops the cart to empty when every line is an unpriceable type', () => {
    const cart = buildCartView('cart-1', [stored()], [product({ type: 'service' })], [])
    expect(cart.items).toHaveLength(0)
    expect(cart.total).toBe(0)
  })

  it('still honours is_coupon_enabled on an unrecognised type', () => {
    // The admin opt-in is an explicit decision about this product, unlike the
    // enum value itself, so it resolves the line rather than being overridden.
    const cart = buildCartView(
      'cart-1',
      [stored()],
      [product({ type: 'service', is_coupon_enabled: true, coupon_price_ils: 80 })],
      [],
    )

    expect(line(cart).type).toBe('coupon')
    expect(line(cart).available).toBe(true)
  })

  it('prices physical and coupon exactly as before', () => {
    const physical = buildCartView('c', [stored()], [product({ type: 'physical' })], [])
    expect(line(physical).available).toBe(true)
    expect(line(physical).type).toBe('physical')

    const coupon = buildCartView(
      'c',
      [stored()],
      [product({ type: 'coupon', coupon_price_ils: 80 })],
      [],
    )
    expect(line(coupon).available).toBe(true)
    expect(line(coupon).type).toBe('coupon')
  })
})
