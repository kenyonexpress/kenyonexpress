import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { describe, expect, it } from 'vitest'

/**
 * NOTHING IN THE DEALS RAIL MAY BE AN IMPORT ARTIFACT.
 *
 * `Reverse Withdrawal Payment` shipped here until 2026-09-04: a WooCommerce
 * internal ledger entry, carried across by the WordPress import as if it were
 * a product, rendering on the homepage with an English name, a price of zero,
 * no image and no category.
 *
 * The shape is what gives it away, and the shape is what this checks. A real
 * deal has a price and belongs to a department; a ledger row has neither.
 */
describe('the live deals fixture', () => {
  it('sells nothing at zero with no category, which is what an artifact looks like', () => {
    const artifacts = KE_LIVE_DEALS.filter(
      (deal) => (deal.kenyon_price ?? 0) <= 0 && deal.category == null,
    )
    expect(
      artifacts.map((d) => d.name_he),
      'entries with no price and no category are import residue, not products',
    ).toEqual([])
  })

  it('gives every entry a Hebrew name', () => {
    // A single Latin word inside Hebrew is ordinary here ("סמסונג גלקסי Samsung
    // Galaxy S22"); an entry with NO Hebrew at all is not a product name.
    const latinOnly = KE_LIVE_DEALS.filter((deal) => !/[֐-׿]/.test(deal.name_he))
    expect(latinOnly.map((d) => d.name_he)).toEqual([])
  })

  it('still has a rail to render', () => {
    expect(KE_LIVE_DEALS.length).toBeGreaterThan(10)
  })
})
