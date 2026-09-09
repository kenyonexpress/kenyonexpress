import { describe, expect, it } from 'vitest'
// Plain .mjs on purpose, same as the neighbours: the generator runs under
// bare node with no build step.
import { DEMO_SET, cleanSql, upsertSql } from '../seed-catalogue.mjs'
import { DEMO_PRODUCTS, DEMO_SUPPLIERS, demoIds } from './demo-data.mjs'

/**
 * The demo-production profile (marathon step 16): the composition CLOSEOUT
 * names, on its own id namespace, through the SAME emitter the catalogue
 * seed already proved against production's rejections. Nothing here runs
 * SQL; the artefact is the reviewable statement block.
 */

// Slugs measured live on the hosted project; the seed may reference only
// categories that already exist, never invent one.
const LIVE_CATEGORY_SLUGS = new Set(['phones-computers', 'restaurants-cafes', 'vacation'])

describe('the demo dataset composition', () => {
  it('is exactly 3 suppliers, 40 physical, 20 coupons', () => {
    expect(DEMO_SUPPLIERS).toHaveLength(3)
    expect(DEMO_PRODUCTS.filter((p) => p.type === 'physical')).toHaveLength(40)
    expect(DEMO_PRODUCTS.filter((p) => p.type === 'coupon')).toHaveLength(20)
  })

  it('lives in its own d3e3 namespace with valid 12-digit uuid tails', () => {
    for (const id of [...demoIds().suppliers, ...demoIds().products]) {
      expect(id).toMatch(/^d3e30000-0000-4000-8000-[12][0-9a-f]{11}$/)
    }
  })

  it('repeats no id and no slug', () => {
    const ids = [...demoIds().suppliers, ...demoIds().products]
    expect(new Set(ids).size).toBe(ids.length)
    const slugs = DEMO_PRODUCTS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('references only categories production already has', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(LIVE_CATEGORY_SLUGS.has(p.categorySlug), p.categorySlug).toBe(true)
    }
  })

  it('points every product at one of the three demo suppliers', () => {
    const suppliers = new Set(demoIds().suppliers)
    for (const p of DEMO_PRODUCTS) expect(suppliers.has(p.supplierId), p.slug).toBe(true)
  })

  it('keeps the money integer-shekel and conserving: coupon price below face', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(Number.isInteger(p.priceIls), `${p.slug} price`).toBe(true)
      if (p.type === 'coupon') {
        expect(Number.isInteger(p.couponPriceIls), `${p.slug} coupon price`).toBe(true)
        expect(p.couponPriceIls).toBeGreaterThan(0)
        expect(p.couponPriceIls).toBeLessThan(p.priceIls)
        expect(p.couponExpiryDays).toBe(90)
        expect(p.stockQuantity).toBeNull()
      } else {
        expect(p.couponPriceIls).toBeNull()
        expect(p.couponExpiryDays).toBeNull()
        expect(p.stockQuantity).toBe(25)
      }
    }
  })

  it('marks every demo row as a demo in the copy, so no shopper is misled', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.shortDescriptionHe).toContain('הדגמה')
    }
  })
})

describe('the demo SQL through the shared emitter', () => {
  const sql = upsertSql(DEMO_SET) as string

  it('is the same battle-tested statement shape: casts, idempotence, joins', () => {
    expect(sql).toContain('v.id::uuid')
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE')
    expect(sql).toContain('JOIN public.categories c ON c.slug = v.category_slug')
  })

  it('carries only demo ids -- the catalogue namespace stays out', () => {
    expect(sql).toContain('d3e30000-')
    expect(sql).not.toContain('5eed0000-')
  })

  it('cleans exactly its own namespace, products before suppliers', () => {
    const clean = cleanSql(DEMO_SET) as string
    expect(clean.indexOf('DELETE FROM public.products')).toBeLessThan(
      clean.indexOf('DELETE FROM public.suppliers'),
    )
    expect(clean).toContain('d3e30000-')
    expect(clean).not.toContain('5eed0000-')
    expect(clean).not.toMatch(/LIKE|slug/)
  })
})
