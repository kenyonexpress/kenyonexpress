import {
  type DealTarget,
  type DealTargets,
  buildDealTargets,
  dealCategorySlugs,
} from '@/lib/deal-targets'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { describe, expect, it } from 'vitest'

/**
 * The homepage grid may not offer a link it cannot answer, and may not withdraw
 * one it simply failed to check.
 *
 * Both halves matter. The first is the NO-GO this file was written for: 8 of
 * live's 32 deal slugs have no reachable product here and answered 404 to
 * anyone who clicked. The second is the failure mode the fix could introduce -
 * one unreachable Supabase at build time stripping every link off the homepage,
 * which is a far bigger regression than the bug being fixed.
 */

/** `noUncheckedIndexedAccess` is on: a missing key is a test failure, not `undefined`. */
function at(targets: DealTargets, slug: string): DealTarget {
  const target = targets[slug]
  if (!target) throw new Error(`no target for ${slug}`)
  return target
}

const DEALS = [
  { slug: 'live-product', category: { slug: 'vacation' } },
  { slug: 'draft-product', category: { slug: 'vacation' } },
  { slug: 'live-product-dead-category', category: { slug: 'general' } },
  { slug: 'no-category' },
] as const

describe('buildDealTargets', () => {
  const catalogue = {
    productIds: new Map([
      ['live-product', 'd613dc56-2a8a-4885-8e54-c4baf6849c8b'],
      ['live-product-dead-category', '7a417ef4-4536-4f03-bdab-b971939c571b'],
      ['no-category', '3b2c1366-6d14-4f7c-b749-7142949400f4'],
    ]),
    categories: new Set(['vacation']),
  }

  it('gives a resolved slug its real uuid, not the fixture id', () => {
    expect(at(buildDealTargets(DEALS, catalogue), 'live-product')).toEqual({
      productId: 'd613dc56-2a8a-4885-8e54-c4baf6849c8b',
      productReachable: true,
      categoryReachable: true,
    })
  })

  it('marks a slug the catalogue does not serve as unreachable and unbuyable', () => {
    expect(at(buildDealTargets(DEALS, catalogue), 'draft-product')).toEqual({
      productId: null,
      productReachable: false,
      categoryReachable: true,
    })
  })

  it('kills the category link on its own, without touching the product link', () => {
    // `אוזניות-איירפודס-3` in the real fixture: the product resolves and only
    // `general` is missing. Counting dead product slugs alone missed this one.
    expect(at(buildDealTargets(DEALS, catalogue), 'live-product-dead-category')).toMatchObject({
      productReachable: true,
      categoryReachable: false,
    })
  })

  it('leaves a card with no category alone', () => {
    expect(at(buildDealTargets(DEALS, catalogue), 'no-category').categoryReachable).toBe(true)
  })

  it('treats an UNREAD catalogue as unknown, so no link is withdrawn', () => {
    const targets = buildDealTargets(DEALS, { productIds: null, categories: null })

    for (const deal of DEALS) {
      expect(at(targets, deal.slug).productReachable, deal.slug).toBe(true)
      expect(at(targets, deal.slug).categoryReachable, deal.slug).toBe(true)
      // Unknown is not addable: without a uuid the cart action rejects the id.
      expect(at(targets, deal.slug).productId, deal.slug).toBeNull()
    }
  })

  it('treats an EMPTY answer as dead, which is not the same as unread', () => {
    const targets = buildDealTargets(DEALS, {
      productIds: new Map(),
      categories: new Set(),
    })

    expect(at(targets, 'live-product').productReachable).toBe(false)
    expect(at(targets, 'live-product').categoryReachable).toBe(false)
  })

  it('covers every card in the real fixture', () => {
    const targets = buildDealTargets(KE_LIVE_DEALS, { productIds: null, categories: null })

    expect(Object.keys(targets)).toHaveLength(KE_LIVE_DEALS.length)
  })
})

describe('dealCategorySlugs', () => {
  it('deduplicates and drops the cards without a category', () => {
    expect(dealCategorySlugs(DEALS).sort()).toEqual(['general', 'vacation'])
  })

  it('finds `general` in the real fixture, which is the category that 404s', () => {
    expect(dealCategorySlugs(KE_LIVE_DEALS)).toContain('general')
  })
})
