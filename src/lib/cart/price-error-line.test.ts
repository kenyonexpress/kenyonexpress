import { unavailableMessage } from '@/lib/cart/format'
import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem, CartView, CartViewItem } from '@/lib/cart/types'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { describe, expect, it } from 'vitest'

/**
 * THE MONEY PATH MUST REFUSE A PRICE THAT IS A DATA ERROR.
 *
 * Production carries `9bb347f8-03ec-48ce-8ff2-2503fb74c895`, "מוצר ראשי מאסטר
 * Master Product", at ₪1 against a ₪400 compare-at with ten in stock and
 * status active. It renders on the homepage as a buyable product. If anyone
 * buys one the order is real, the payment is real, and there is nothing to
 * fulfil. `migrations/pending/172` removes it and needs approval; this is the
 * half that can be done without touching production.
 *
 * The fixture below is that row's real numbers. `implausible-discount.test.ts`
 * covers the threshold itself; what THIS file proves is the wiring -- that the
 * verdict reaches the cart view and then survives all the way to the gate
 * `beginCheckout` actually consults.
 */

type ProductRow = Parameters<typeof buildCartView>[2][number]

function masterProductRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: '9bb347f8-03ec-48ce-8ff2-2503fb74c895',
    slug: 'restaurants-meat-3',
    name_he: 'מוצר ראשי מאסטר Master Product',
    type: 'physical',
    kenyon_price: 1,
    full_price: 400,
    stock_quantity: 10,
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

function stored(overrides: Partial<CartStorageItem> = {}): CartStorageItem {
  return {
    product_id: '9bb347f8-03ec-48ce-8ff2-2503fb74c895',
    variant_id: null,
    quantity: 1,
    ...overrides,
  }
}

function line(cart: CartView, index = 0): CartViewItem {
  const item = cart.items[index]
  if (!item) throw new Error(`expected a line at ${index}, got ${cart.items.length} item(s)`)
  return item
}

describe('a line whose price is an implausible fraction of its compare-at', () => {
  it('is marked unavailable with price_error, not with a stock reason', () => {
    const cart = buildCartView('cart-1', [stored()], [masterProductRow()], [])

    expect(line(cart).available).toBe(false)
    // The specific reason matters. Ten are in stock and the money engine can
    // price it perfectly well, so `out_of_stock` and `unpriced` would both be
    // lies, and `insufficient_stock` would tell the shopper to lower a quantity
    // that was never the problem.
    expect(line(cart).unavailable_reason).toBe('price_error')
  })

  it('is refused by the gate beginCheckout consults, so no money can move', () => {
    // `runBeginCheckout` calls `validateCartView` before anything else, and
    // every payment branch is downstream of it. This is the assertion that
    // says the row cannot be bought tonight.
    const cart = buildCartView('cart-1', [stored()], [masterProductRow()], [])
    const verdict = validateCartView(cart)

    expect(verdict.ok).toBe(false)
  })

  it('tells the shopper something true and actionable, and the action works', () => {
    const cart = buildCartView('cart-1', [stored()], [masterProductRow()], [])
    expect(unavailableMessage(line(cart))).toBe(
      'המוצר אינו זמין להזמנה כרגע — הסירו מהעגלה כדי להמשיך',
    )

    // THE COPY PROMISES A REMEDY, SO THE REMEDY HAS TO REACH THIS LINE.
    // `runRemoveUnavailableItems` selects on exactly `!item.available` and
    // nothing finer, so a `price_error` line is swept by the existing
    // "remove unavailable" control with no change to it. Asserted here rather
    // than left implicit: making this reason block checkout while leaving the
    // line `available: true` is a plausible future edit, and it would strand a
    // shopper behind a banner telling them to remove something the remover
    // cannot see.
    expect(cart.items.filter((i) => !i.available)).toHaveLength(1)
  })

  it('outranks the stock reasons even when the shelf is also short', () => {
    // Ordering, asserted rather than assumed. A shopper asking for five of two
    // remaining must not be told to reduce the quantity, because buying one is
    // not fine either.
    const cart = buildCartView(
      'cart-1',
      [stored({ quantity: 5 })],
      [masterProductRow({ stock_quantity: 2 })],
      [],
    )
    expect(line(cart).unavailable_reason).toBe('price_error')
  })

  it('still reports delisted first when the product is also gone', () => {
    // `delisted` stays the outermost reason: a product that is gone is gone
    // whatever its price columns say.
    const cart = buildCartView('cart-1', [stored()], [masterProductRow({ status: 'draft' })], [])
    expect(line(cart).unavailable_reason).toBe('delisted')
  })
})

describe('the same wiring leaves ordinary lines alone', () => {
  it('sells the row at a real price against the same compare-at', () => {
    // The guard is about the RATIO, not about this id or this name. Correct
    // the price and the identical row sells.
    const cart = buildCartView('cart-1', [stored()], [masterProductRow({ kenyon_price: 320 })], [])
    expect(line(cart).available).toBe(true)
    expect(line(cart).unavailable_reason).toBeNull()
    expect(validateCartView(cart).ok).toBe(true)
  })

  it('sells a ₪1 product that never claimed to be a discount', () => {
    // ₪1 is not the defect. ₪1 advertised as 99.75% off ₪400 is.
    const cart = buildCartView('cart-1', [stored()], [masterProductRow({ full_price: null })], [])
    expect(line(cart).available).toBe(true)
  })

  it('sells the deepest genuine discount in the live catalogue', () => {
    // תספורת לגבר, ילד, סידור זקן בפתח תקווה: ₪20 of ₪50, 60% off, real.
    const cart = buildCartView(
      'cart-1',
      [stored()],
      [masterProductRow({ kenyon_price: 20, full_price: 50 })],
      [],
    )
    expect(line(cart).available).toBe(true)
  })
})
