import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { describe, expect, it } from 'vitest'
// Plain .mjs on purpose: the auditor runs under bare node with no build step.
import {
  CANONICAL_CATEGORIES,
  GRID_SLUGS,
  MEASURED_2026_08_19,
  OPEN_TAXONOMIES,
  auditSql,
  evaluate,
  passes,
} from './launch-bar.mjs'

/**
 * The bar, checked against the one measurement that exists. Every number in
 * `MEASURED_2026_08_19` came out of the SQL `auditSql()` emits, run against
 * production on 19.08.2026, so these assertions describe the catalogue rather
 * than describing the code that describes the catalogue.
 */

type Metrics = typeof MEASURED_2026_08_19

const measured = MEASURED_2026_08_19 as Metrics
const rows = evaluate(measured) as Array<{
  label: string
  requirement: string
  actual: number | string
  pass: boolean
}>

const row = (needle: string) => {
  const found = rows.find((r) => r.label.includes(needle))
  if (!found) throw new Error(`no bar row matching ${needle}`)
  return found
}

describe('the grid list the auditor carries', () => {
  it('is the live grid, slug for slug and in order', () => {
    // The .mjs cannot import the TS module, so drift is caught here or nowhere.
    expect(GRID_SLUGS).toEqual(KE_LIVE_DEALS.map((d) => d.slug))
  })

  it('is 31 cards: live renders 32 and one of them is not a product', () => {
    // Live's grid has 32 cards. The 32nd is `reverse-withdrawal-payment`, Dokan
    // bookkeeping that the WordPress importer already excludes by slug in
    // scripts/wp-import/config.mjs -- this list and KE_LIVE_DEALS were the two
    // places still mirroring the live DOM verbatim, artifact included.
    expect(GRID_SLUGS).toHaveLength(31)
  })
})

describe('the canonical categories', () => {
  it('are 12, matching migration 018', () => {
    expect(CANONICAL_CATEGORIES).toHaveLength(12)
  })

  it('count only taxonomies as coverage, not collections', () => {
    // hot-deals / under-99 / new are rules with no column to enforce them, and
    // courses is closed until there is a subscription product. Demanding a
    // coupon in any of them would be demanding a row nothing can produce.
    expect(OPEN_TAXONOMIES).toHaveLength(7)
    expect(OPEN_TAXONOMIES).not.toContain('hot-deals')
    expect(OPEN_TAXONOMIES).not.toContain('under-99')
    expect(OPEN_TAXONOMIES).not.toContain('new')
    expect(OPEN_TAXONOMIES).not.toContain('courses')
    expect(OPEN_TAXONOMIES).not.toContain('electronics')
  })
})

describe('the emitted SQL', () => {
  const sql = auditSql() as string

  it('reads and never writes', () => {
    expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|truncate)\b/i)
  })

  it('carries all 32 grid slugs into the query', () => {
    for (const slug of GRID_SLUGS) expect(sql).toContain(slug)
  })

  it('escapes a quote rather than closing the literal', () => {
    // No current slug has one. The next WP import is the reason this is here.
    expect(auditSql()).not.toContain("''''")
  })

  it('counts coupons that are not demo rows separately from all coupons', () => {
    expect(sql).toContain("attributes->>'demo'")
    expect(sql).toContain('real_coupons')
    expect(sql).toContain('active_coupons_incl_demo')
  })
})

describe('production on 19.08.2026', () => {
  it('fails the bar', () => {
    expect(passes(measured)).toBe(false)
  })

  it('has no real coupon deal at all, only the 15 demo rows', () => {
    // This is the finding that moved the row from "quantity yes, quality no"
    // to a plain zero: demo-coupon-1..15, one per category, all picsum.
    expect(measured.real_coupons).toBe(0)
    expect(measured.active_coupons_incl_demo).toBe(15)
    expect(row('דילי קופון אמיתיים').pass).toBe(false)
  })

  it('separates the 2 missing grid cards from the 6 that are draft', () => {
    // 8 cards 404, but a draft is a publish away and a missing row is not.
    expect(measured.grid_missing).toBe(2)
    expect(measured.grid_inactive).toBe(6)
    expect(measured.grid_ok + measured.grid_missing + measured.grid_inactive).toBe(
      measured.grid_total,
    )
  })

  it('has a sort_order collision among the 12 categories', () => {
    // electronics and professionals both sit on 10, so the sidebar order
    // between them is whatever the planner returns.
    expect(measured.sort_order_collisions).toBe(1)
    expect(row('sort_order').pass).toBe(false)
  })

  it('covers none of the 7 open taxonomies with a real coupon', () => {
    expect(measured.taxonomies_with_real_coupon).toBe(0)
    expect(row('טקסונומיות פתוחות').pass).toBe(false)
  })

  it('holds no supplier a customer could reach', () => {
    expect(measured.suppliers_complete).toBe(0)
    expect(measured.suppliers_of_active_incomplete).toBe(11)
  })
})

describe('a catalogue that clears the bar', () => {
  const green: Metrics = {
    ...measured,
    products_active_real: 61,
    real_coupons: 12,
    suppliers_complete: 11,
    suppliers_of_active_incomplete: 0,
    picsum_active: 0,
    missing_platform_percent: 0,
    missing_category: 0,
    grid_ok: 32,
    grid_missing: 0,
    grid_inactive: 0,
    vouchers: 1,
    taxonomies_with_real_coupon: 7,
    sort_order_collisions: 0,
  }

  it('passes every row', () => {
    expect(passes(green)).toBe(true)
  })

  it('still fails on nine real coupons, because the floor is ten', () => {
    expect(passes({ ...green, real_coupons: 9 })).toBe(false)
    expect(passes({ ...green, real_coupons: 9 }, { minRealCoupons: 9 })).toBe(true)
  })

  it('does not pass a shop with zero suppliers by vacuous truth', () => {
    // 0 complete of 0 total is not "every supplier is complete".
    expect(passes({ ...green, suppliers: 0, suppliers_complete: 0 })).toBe(false)
  })
})
