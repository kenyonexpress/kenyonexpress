import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem } from '@/lib/cart/types'
import { DEFAULT_SHIPPING_METHOD_ID, resolveShippingMethod } from '@/lib/shipping/methods'
import { describe, expect, it } from 'vitest'

/**
 * A flash-sale hold inside the cart pricer (STEP 61). What can only fail
 * HERE: the hold's integer price replaces the catalogue's converted one for
 * the whole line, the line says which sale priced it, the implausible
 * discount guard stands aside for it (a 70% flash cut is the point, not a
 * typo), and the hold does NOT apply to a variant line, to a line asking for
 * more than the hold covers, or to a product the shopper holds nothing for.
 */

type ProductRow = Parameters<typeof buildCartView>[2][number]

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'mug',
    slug: 'mug',
    name_he: 'ספל',
    type: 'physical',
    kenyon_price: 100,
    full_price: 100,
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

const stored = (
  product_id: string,
  quantity = 1,
  variant_id: string | null = null,
): CartStorageItem => ({
  product_id,
  variant_id,
  quantity,
})

const SHIPPING = resolveShippingMethod(DEFAULT_SHIPPING_METHOD_ID)
const NOW = new Date('2026-10-08T12:00:00Z')
const HOLD = { flash_sale_id: 'fs1', product_id: 'mug', price_agorot: 3000, quantity: 2 }

function build(items: CartStorageItem[], holds = [HOLD], products = [product()]) {
  return buildCartView('cart', items, products, [], null, SHIPPING, [], NOW, holds)
}

describe('buildCartView with a flash hold', () => {
  it('prices the line at the hold integer and names the sale', () => {
    const cart = build([stored('mug', 2)])
    const line = cart.items[0]
    expect(line?.unit_price).toBe(3000)
    expect(line?.line_total).toBe(6000)
    expect(line?.flash_sale_id).toBe('fs1')
    expect(line?.available).toBe(true)
    expect(cart.subtotal).toBe(6000)
    // Integer agorot throughout, like every other line.
    expect(Number.isInteger(cart.total)).toBe(true)
  })

  it('does not read a deep flash cut as a price error', () => {
    // ₪100 compare-at against ₪30: a typo guard would refuse this; the flash
    // price is the admin's deliberate figure and the line stays sellable.
    const cart = build([stored('mug', 1)])
    expect(cart.items[0]?.unavailable_reason).toBeNull()
  })

  it('prices at the catalogue when the line exceeds the hold, names a variant, or has no hold', () => {
    const over = build([stored('mug', 3)])
    expect(over.items[0]?.unit_price).toBe(10000)
    expect(over.items[0]?.flash_sale_id).toBeNull()

    const variants = [
      {
        id: 'v1',
        product_id: 'mug',
        price: null,
        price_modifier: 0,
        stock_quantity: null,
        is_active: true,
        deleted_at: null,
      },
    ]
    const withVariant = buildCartView(
      'cart',
      [stored('mug', 1, 'v1')],
      [product()],
      variants,
      null,
      SHIPPING,
      [],
      NOW,
      [HOLD],
    )
    expect(withVariant.items[0]?.unit_price).toBe(10000)
    expect(withVariant.items[0]?.flash_sale_id).toBeNull()

    const none = build([stored('mug', 1)], [])
    expect(none.items[0]?.unit_price).toBe(10000)
    expect(none.items[0]?.flash_sale_id).toBeNull()
  })

  it('ignores a hold whose price is not a positive integer', () => {
    const bad = build([stored('mug', 1)], [{ ...HOLD, price_agorot: 29.5 }])
    expect(bad.items[0]?.unit_price).toBe(10000)
    const zero = build([stored('mug', 1)], [{ ...HOLD, price_agorot: 0 }])
    expect(zero.items[0]?.unit_price).toBe(10000)
  })

  it('leaves the other lines alone', () => {
    const cart = build(
      [stored('mug', 1), stored('plate', 1)],
      [HOLD],
      [product(), product({ id: 'plate', slug: 'plate', name_he: 'צלחת', kenyon_price: 200 })],
    )
    expect(cart.items.map((i) => [i.product_id, i.unit_price, i.flash_sale_id])).toEqual([
      ['mug', 3000, 'fs1'],
      ['plate', 20000, null],
    ])
    expect(cart.subtotal).toBe(23000)
  })
})
