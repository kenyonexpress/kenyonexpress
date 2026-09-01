import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildOrderItemSnapshot } from '@/lib/commerce/product-money'
import { describe, expect, it } from 'vitest'

/**
 * `platform_percent` is snapshotted onto the order line at purchase, and the
 * whole point is that changing the product afterwards must not move money that
 * has already been split.
 *
 * WHY THIS NEEDS ITS OWN FILE. `product-money.test.ts` already asserts that a
 * snapshot survives a later edit to the SUPPLIER object, but only for
 * `supplier_name` and `supplier_address`. Nothing asserted it for the percent,
 * which is the field that decides who gets the money. A snapshot that quietly
 * tracked its source would not fail a single existing test and would repay
 * every historical supplier at today's rate.
 *
 * The invariant has two halves and both are checked here. The first is that the
 * snapshot copies rather than references. The second is the one that actually
 * protects the money: that the settlement path reads the percent from the ORDER
 * LINE and never re-derives it from `products`. A perfect snapshot is worthless
 * if a later reader joins back to the source.
 */

const SUPPLIER = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'מסעדת השף הגדול',
  phone: '03-1234567',
  address: 'דיזנגוף 100, תל אביב',
  logo_url: 'https://cdn.example.com/logo.png',
}

describe('the percent snapshot copies, it does not reference', () => {
  it('keeps the purchase-time percent after the product is repriced', () => {
    // The product as it was when the customer bought: platform takes 30%.
    const product = { platformPercent: 30, supplierSplitPercent: 70 }

    const line = buildOrderItemSnapshot({
      type: 'coupon',
      platformPercent: product.platformPercent,
      supplierSplitPercent: product.supplierSplitPercent,
      discountPercent: 90,
      couponPriceIls: 10,
      supplier: SUPPLIER,
    })

    // The operator renegotiates the deal the next morning.
    product.platformPercent = 5
    product.supplierSplitPercent = 95

    // The order that already happened is settled at the old rate, not the new.
    expect(line.platform_percent).toBe(30)
    expect(line.supplier_split_percent).toBe(70)
  })

  it('is unaffected when the whole source object is mutated in place', () => {
    const source = {
      platformPercent: 15,
      supplierSplitPercent: 85,
      discountPercent: 5,
      couponPriceIls: null as number | null,
      supplier: { ...SUPPLIER },
    }

    const line = buildOrderItemSnapshot({ type: 'physical', ...source })

    source.platformPercent = 99
    source.supplierSplitPercent = 1
    source.discountPercent = 0
    source.supplier.name = 'ספק אחר לגמרי'

    expect(line.platform_percent).toBe(15)
    expect(line.supplier_split_percent).toBe(85)
    expect(line.discount_percent).toBe(5)
    expect(line.supplier_name).toBe('מסעדת השף הגדול')
  })

  it('two lines bought at different rates keep their own rates', () => {
    const before = buildOrderItemSnapshot({
      type: 'coupon',
      platformPercent: 30,
      supplierSplitPercent: 70,
      discountPercent: 90,
      couponPriceIls: 10,
      supplier: SUPPLIER,
    })
    const after = buildOrderItemSnapshot({
      type: 'coupon',
      platformPercent: 5,
      supplierSplitPercent: 95,
      discountPercent: 90,
      couponPriceIls: 10,
      supplier: SUPPLIER,
    })

    expect(before.platform_percent).toBe(30)
    expect(after.platform_percent).toBe(5)
  })
})

describe('the settlement path reads the percent from the order line', () => {
  // A static read of the source, in the manner of the rate-limit policy audit.
  // This cannot be asserted at runtime without a database, and the failure it
  // guards against is a future edit that joins back to `products` for a rate.
  const finalize = readFileSync(resolve(process.cwd(), 'src/server/payments/finalize.ts'), 'utf8')

  it('selects platform_percent from order_items', () => {
    // The select names the column on the item row. If a later refactor drops it
    // from the select, `item.platform_percent` becomes undefined and the coupon
    // branch refuses to issue rather than settling at a guessed rate.
    expect(finalize).toContain('platform_percent')
    expect(finalize).toMatch(/from\(['"]order_items['"]\)/)
  })

  it('refuses to settle a coupon line that carries no snapshot', () => {
    // Failing closed is the correct direction: a missing snapshot means the
    // rate is unknown, and the alternative is paying somebody at a rate nobody
    // agreed to.
    expect(finalize).toMatch(/has no platform_percent snapshot; refusing to issue/)
  })

  it('never re-derives an order line rate by joining products', () => {
    // The specific regression: `.from('order_items').select('..., products(platform_percent)')`
    // would compile, pass every other test, and silently repay history at today's rate.
    expect(finalize).not.toMatch(/products\s*\(\s*[^)]*platform_percent/)
    expect(finalize).not.toMatch(/products\s*:\s*[^)]*platform_percent/)
  })
})
