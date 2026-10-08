import type { BundleDefinition } from '@/lib/bundles/evaluate'
import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem } from '@/lib/cart/types'
import { DEFAULT_SHIPPING_METHOD_ID, resolveShippingMethod } from '@/lib/shipping/methods'
import { describe, expect, it } from 'vitest'

/**
 * Bundle savings inside the cart pricer (STEP 60). The set arithmetic is
 * proven in lib/bundles/evaluate.test.ts; what can only fail HERE is the
 * join to the money engine: the saving is taken from the lines the engine
 * priced, capped at the commission the settlement will honour, shares that
 * ceiling with a coupon, and lands in `total` exactly once.
 */

type ProductRow = Parameters<typeof buildCartView>[2][number]

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'mug',
    slug: 'mug',
    name_he: 'ספל',
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

const PRODUCTS = [
  product(),
  product({ id: 'plate', slug: 'plate', name_he: 'צלחת', kenyon_price: 200 }),
]

function stored(product_id: string, quantity = 1): CartStorageItem {
  return { product_id, variant_id: null, quantity }
}

const SHIPPING = resolveShippingMethod(DEFAULT_SHIPPING_METHOD_ID)
const NOW = new Date('2026-10-08T12:00:00Z')

function bundle(overrides: Partial<BundleDefinition> = {}): BundleDefinition {
  return {
    id: 'b1',
    name_he: 'ספל וצלחת',
    discount_agorot: 1500,
    starts_at: null,
    expires_at: null,
    items: [
      { product_id: 'mug', quantity: 1 },
      { product_id: 'plate', quantity: 1 },
    ],
    ...overrides,
  }
}

function view(
  items: CartStorageItem[],
  bundles: BundleDefinition[],
  coupon: Parameters<typeof buildCartView>[4] = null,
) {
  return buildCartView('cart-1', items, PRODUCTS, [], coupon, SHIPPING, bundles, NOW)
}

describe('buildCartView with bundles', () => {
  it('prices exactly as before when no rule is given', () => {
    const cart = view([stored('mug'), stored('plate')], [])
    expect(cart.bundles).toEqual([])
    expect(cart.bundle_discount).toBe(0)
    expect(cart.subtotal).toBe(30000)
    expect(cart.total).toBe(30000)
  })

  it('takes a completed set off the total once, in integer agorot', () => {
    const cart = view([stored('mug'), stored('plate')], [bundle()])
    expect(cart.bundles).toEqual([{ id: 'b1', name_he: 'ספל וצלחת', times: 1, discount: 1500 }])
    expect(cart.bundle_discount).toBe(1500)
    expect(cart.subtotal).toBe(30000)
    expect(cart.discount).toBe(0)
    expect(cart.total).toBe(28500)
    expect(Number.isInteger(cart.total)).toBe(true)
  })

  it('leaves an incomplete set unpriced and the total untouched', () => {
    const cart = view([stored('mug')], [bundle()])
    expect(cart.bundles).toEqual([])
    expect(cart.total).toBe(10000)
  })

  it('caps the saving at the commission, the ceiling settlement.ts enforces', () => {
    // 10% of ₪300 is ₪30 of commission; a ₪50 bundle cannot exceed it, or the
    // card would be charged less than the cart promised.
    const cart = view([stored('mug'), stored('plate')], [bundle({ discount_agorot: 5000 })])
    expect(cart.platform_fee).toBe(3000)
    expect(cart.bundle_discount).toBe(3000)
    expect(cart.total).toBe(27000)
  })

  it('shares the commission ceiling with a coupon so the pair adds up', () => {
    const coupon = { code: 'SAVE', label: 'SAVE', discountAgorot: 2500 }
    const cart = view([stored('mug'), stored('plate')], [bundle()], coupon)
    // ₪30 commission: ₪15 to the bundle, ₪15 left for the ₪25 code.
    expect(cart.bundle_discount).toBe(1500)
    expect(cart.discount).toBe(1500)
    expect(cart.total).toBe(27000)
  })

  it('does not count a line the engine refused to price', () => {
    const unpriced = product({
      id: 'plate',
      slug: 'plate',
      platform_percent: null,
      kenyon_price: 200,
    })
    const cart = buildCartView(
      'cart-1',
      [stored('mug'), stored('plate')],
      [product(), unpriced],
      [],
      null,
      SHIPPING,
      [bundle()],
      NOW,
    )
    expect(cart.bundles).toEqual([])
    expect(cart.bundle_discount).toBe(0)
  })

  it('ignores a bundle outside its window', () => {
    const cart = view(
      [stored('mug'), stored('plate')],
      [bundle({ expires_at: '2026-10-01T00:00:00Z' })],
    )
    expect(cart.bundles).toEqual([])
  })
})
