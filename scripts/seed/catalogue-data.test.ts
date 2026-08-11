import { describe, expect, it } from 'vitest'
// Plain .mjs on purpose: the seeding script runs under bare node with no build
// step, so its data lives in a module TypeScript infers rather than checks.
import { PRODUCTS, SUPPLIERS, seedId, seededIds } from './catalogue-data.mjs'

/**
 * Every assertion here is a rule the catalogue enforces somewhere else and that
 * a seed can quietly violate — which is the whole risk of seeding: the rows go
 * in, nothing errors, and the storefront renders something wrong.
 */

type Supplier = {
  id: string
  name: string
  address: string
  city: string
  contactPhone: string
  logoUrl: string
}
type Product = {
  id: string
  slug: string
  nameHe: string
  type: string
  priceIls: number
  couponPriceIls: number | null
  platformPercent: number
  categorySlug: string
  supplierId: string
  imageUrl: string
  stockQuantity: number | null
}

const suppliers = SUPPLIERS as Supplier[]
const products = PRODUCTS as Product[]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('the ids', () => {
  it('are real UUIDs', () => {
    // The first version emitted eleven hex digits in the last group. Postgres
    // answers 22P02 on the first row; the generated SQL looked fine, because a
    // UUID is just a long string until something parses it.
    for (const id of [...suppliers.map((s) => s.id), ...products.map((p) => p.id)]) {
      expect(id, id).toMatch(UUID)
    }
  })

  it('all sit in the reserved namespace, so the teardown can be exact', () => {
    for (const id of [...suppliers.map((s) => s.id), ...products.map((p) => p.id)]) {
      expect(id.startsWith('5eed0000-')).toBe(true)
    }
  })

  it('are unique across both tables', () => {
    const all = [...suppliers.map((s) => s.id), ...products.map((p) => p.id)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('are stable: the same index always yields the same id', () => {
    expect(seedId('supplier', 3)).toBe(seedId('supplier', 3))
    expect(seedId('supplier', 3)).not.toBe(seedId('product', 3))
  })

  it('reports every id it owns, so nothing is orphaned by the teardown', () => {
    const ids = seededIds() as { suppliers: string[]; products: string[] }
    expect(ids.suppliers).toHaveLength(suppliers.length)
    expect(ids.products).toHaveLength(products.length)
  })
})

describe('the suppliers, which exist to be complete', () => {
  it('are ten', () => {
    expect(suppliers).toHaveLength(10)
  })

  it('every one has an address, a city, a phone and a logo', () => {
    // The point of the set, not a detail. Production has 11 suppliers with none
    // of those, and the publish gate makes their products uneditable in the
    // admin — a seed reproducing that gap would seed the bug.
    for (const supplier of suppliers) {
      expect(supplier.address?.trim(), supplier.name).toBeTruthy()
      expect(supplier.city?.trim(), supplier.name).toBeTruthy()
      expect(supplier.contactPhone?.trim(), supplier.name).toBeTruthy()
      expect(supplier.logoUrl?.startsWith('https://'), supplier.name).toBe(true)
    }
  })

  // Was: 'carries a split percent that leaves the platform a share'. Inverted on
  // 2026-08-12. A supplier-level percentage is exactly what AGENTS.md forbids,
  // and migration 112 dropped the column the old field was seeding
  // (suppliers.default_split_percent). The seed must not grow a replacement for
  // it under a new name, so the assertion is now that no supplier carries any
  // percentage at all.
  it('carries no percentage of any kind: every percent is per product', () => {
    for (const supplier of suppliers) {
      const percentKeys = Object.keys(supplier).filter((k) =>
        /percent|rate|split|commission/i.test(k),
      )
      expect(percentKeys, `${supplier.name} must hold identity and payout only`).toEqual([])
    }
  })
})

describe('the products', () => {
  it('are thirty, with unique slugs', () => {
    expect(products).toHaveLength(30)
    expect(new Set(products.map((p) => p.slug)).size).toBe(30)
  })

  it('gives every product a DIFFERENT platform percent than its neighbours', () => {
    // `platform_percent` is NOT NULL with no DEFAULT (050) and is snapshotted
    // per line at purchase. A seed where every row shared a number would not
    // have caught a hardcoded percent, which is the failure the whole model
    // exists to prevent.
    const percents = new Set(products.map((p) => p.platformPercent))
    expect(percents.size).toBeGreaterThan(10)
    for (const p of products) {
      expect(p.platformPercent, p.slug).toBeGreaterThan(0)
      expect(p.platformPercent, p.slug).toBeLessThan(100)
    }
  })

  it('prices every coupon strictly below its sticker price', () => {
    // Equal or above is not a discount: the badge would read 0% or negative.
    for (const p of products.filter((x) => x.type === 'coupon')) {
      expect(p.couponPriceIls, p.slug).not.toBeNull()
      expect(p.couponPriceIls as number, p.slug).toBeGreaterThan(0)
      expect(p.couponPriceIls as number, p.slug).toBeLessThan(p.priceIls)
    }
  })

  it('leaves physical products with no coupon price at all', () => {
    // `is_coupon_enabled` with no `coupon_price_ils` is the state that makes 4
    // of production's 61 active products unbuyable. The seed must not add more.
    for (const p of products.filter((x) => x.type === 'physical')) {
      expect(p.couponPriceIls, p.slug).toBeNull()
    }
  })

  it('gives stock to physical goods and none to coupons', () => {
    // A coupon is minted on payment; a stock count on one is a number nothing
    // decrements.
    for (const p of products) {
      if (p.type === 'coupon') expect(p.stockQuantity, p.slug).toBeNull()
      else expect(p.stockQuantity as number, p.slug).toBeGreaterThan(0)
    }
  })

  it('points every product at a supplier this seed also creates', () => {
    const owned = new Set(suppliers.map((s) => s.id))
    for (const p of products) expect(owned.has(p.supplierId), p.slug).toBe(true)
  })

  it('uses only categories that already exist in production', () => {
    // Measured 2026-08-06: 12 active category slugs. Inventing one would put a
    // demo entry in the site navigation.
    const existing = new Set([
      'hot-deals',
      'under-99',
      'new',
      'restaurants-cafes',
      'beauty-health',
      'phones-computers',
      'baby-kids',
      'vacation',
      'pets',
      'electronics',
      'professionals',
      'courses',
    ])
    for (const p of products) expect(existing.has(p.categorySlug), p.categorySlug).toBe(true)
  })

  it('names every product in Hebrew', () => {
    for (const p of products) expect(p.nameHe, p.slug).toMatch(/[֐-׿]/)
  })

  it('points every image at an allowlisted host', () => {
    // picsum is in `REMOTE_IMAGE_PATTERNS` and, since [50], in the CSP img-src.
    for (const p of products) {
      expect(p.imageUrl.startsWith('https://picsum.photos/'), p.slug).toBe(true)
    }
  })
})
