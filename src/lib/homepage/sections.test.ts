import { RAIL_SOURCES, SECTION_KINDS, parseSectionConfig } from '@/lib/homepage/sections'
import { describe, expect, it } from 'vitest'

/**
 * `parseSectionConfig` is what stands between a typo in a JSON box and the page
 * every visitor lands on. It must never throw, and it must never return a shape
 * the renderer would read keys off blindly.
 */
describe('parseSectionConfig', () => {
  it('applies the default limit in one place', () => {
    const parsed = parseSectionConfig('product_rail', { source: 'newest' })
    expect(parsed).toEqual({
      kind: 'product_rail',
      config: { source: 'newest', productIds: [], limit: 4 },
    })
  })

  it('defaults an unspecified source rather than refusing the section', () => {
    expect(parseSectionConfig('product_rail', {})).toEqual({
      kind: 'product_rail',
      config: { source: 'newest', productIds: [], limit: 4 },
    })
  })

  it('refuses a manual rail that names no products', () => {
    // A heading over nothing. Refused here so the renderer never has to ask.
    expect(parseSectionConfig('product_rail', { source: 'manual', productIds: [] })).toBeNull()
  })

  it('refuses a rule that does not exist', () => {
    expect(parseSectionConfig('product_rail', { source: 'most_clicked' })).toBeNull()
  })

  it('caps the limit rather than rendering a category page in a rail', () => {
    expect(parseSectionConfig('product_rail', { source: 'newest', limit: 99 })).toBeNull()
  })

  it('refuses a product id that is not a uuid', () => {
    expect(parseSectionConfig('product_rail', { source: 'manual', productIds: ['x'] })).toBeNull()
  })

  it('reads a category spotlight and refuses one with no slug', () => {
    expect(parseSectionConfig('category_spotlight', { categorySlug: 'hot-deals' })).toEqual({
      kind: 'category_spotlight',
      config: { categorySlug: 'hot-deals', limit: 4 },
    })
    expect(parseSectionConfig('category_spotlight', {})).toBeNull()
  })

  it('refuses a supplier spotlight whose id is not a uuid', () => {
    expect(parseSectionConfig('supplier_spotlight', { supplierId: 'acme' })).toBeNull()
  })

  describe('countdown', () => {
    const deadline = '2026-12-31T21:00:00+02:00'

    it('reads a deadline with an offset', () => {
      expect(parseSectionConfig('countdown', { deadline })).toEqual({
        kind: 'countdown',
        config: { deadline },
      })
    })

    it('refuses a date with no time zone, which would mean a different instant per server', () => {
      expect(parseSectionConfig('countdown', { deadline: '2026-12-31' })).toBeNull()
    })

    it('refuses an external link, the way 127 refuses one on a banner', () => {
      // Our own hero linking off-site is an open redirect wearing a marketing
      // hat, and a protocol-relative URL looks internal in a text box.
      expect(
        parseSectionConfig('countdown', { deadline, linkUrl: 'https://evil.example' }),
      ).toBeNull()
      expect(parseSectionConfig('countdown', { deadline, linkUrl: '//evil.example' })).toBeNull()
      expect(parseSectionConfig('countdown', { deadline, linkUrl: '/products' })).not.toBeNull()
    })
  })

  it('gives the seven configuration-free kinds an empty object', () => {
    for (const kind of [
      'hero',
      'categories',
      'benefits',
      'deals',
      'featured',
      'city_deals',
      'banner_row',
    ]) {
      expect(parseSectionConfig(kind, { anything: 'ignored' })).toEqual({ kind, config: {} })
    }
  })

  it('never throws on junk, whatever shape it is', () => {
    for (const junk of [null, undefined, 'hello', 42, [1, 2, 3], { source: {} }]) {
      expect(() => parseSectionConfig('product_rail', junk)).not.toThrow()
    }
    expect(parseSectionConfig('product_rail', [1, 2, 3])).not.toBeNull()
    expect(parseSectionConfig('carousel_of_doom', {})).toBeNull()
  })
})

describe('the kind and source lists', () => {
  it('carry 127 seven plus the four 206 adds', () => {
    expect([...SECTION_KINDS]).toEqual([
      'hero',
      'categories',
      'benefits',
      'deals',
      'featured',
      'city_deals',
      'banner_row',
      'product_rail',
      'category_spotlight',
      'supplier_spotlight',
      'countdown',
    ])
  })

  it('names the four rail sources the section asked for', () => {
    expect([...RAIL_SOURCES]).toEqual(['manual', 'biggest_discount', 'newest', 'ending_soon'])
  })
})
