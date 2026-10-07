import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { describe, expect, it } from 'vitest'
import {
  CacheLife,
  CacheTags,
  MAX_CACHE_TAG_LENGTH,
  cacheTagsForChange,
  isKnownCacheTag,
} from './tags'

const PRODUCT_ID = '0f2b6a9e-7c1d-4e5a-9b3c-2d8e1f4a6c7b'
const CATEGORY_ID = '7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a'
const OTHER_CATEGORY_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const SUPPLIER_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b'

function product(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PRODUCT_ID,
    slug: 'demo-product',
    status: 'active',
    deleted_at: null,
    category_id: CATEGORY_ID,
    supplier_id: SUPPLIER_ID,
    kenyon_price: 12900,
    stock_quantity: 10,
    updated_at: '2026-10-07T20:00:00.000Z',
    ...overrides,
  }
}

describe('CacheTags', () => {
  it('keeps the umbrella tag the admin actions already expire', () => {
    expect(CacheTags.catalogue).toBe(CATALOGUE_TAG)
  })

  it('builds per-entity tags that are valid cache tags', () => {
    for (const tag of [
      CacheTags.product(PRODUCT_ID),
      CacheTags.category(CATEGORY_ID),
      CacheTags.supplier(SUPPLIER_ID),
      CacheTags.home,
      CacheTags.sitemap,
      CacheTags.feed,
      CacheTags.productList,
    ]) {
      expect(tag.length).toBeLessThanOrEqual(MAX_CACHE_TAG_LENGTH)
      expect(isKnownCacheTag(tag), tag).toBe(true)
    }
  })
})

describe('CacheLife', () => {
  it('matches the route matrix in ARCHITECTURE-PERFORMANCE.md §2.1', () => {
    expect(CacheLife.home.revalidate).toBe(120)
    expect(CacheLife.product.revalidate).toBe(120)
    expect(CacheLife.list.revalidate).toBe(300)
    expect(CacheLife.productsIndex.revalidate).toBe(180)
    expect(CacheLife.sitemap.revalidate).toBe(3600)
  })

  /**
   * The thresholds in the cacheLife reference ("Prerendering behavior"): a
   * `stale` under 300 drops the scope out of the route's app shell, an
   * `expire` under 300 turns it into a dynamic hole, and `expire` must be
   * longer than `revalidate` or Next refuses the profile at build.
   */
  it('keeps every profile inside the prerendered shell with an SWR window', () => {
    for (const [name, life] of Object.entries(CacheLife)) {
      expect(life.stale, `${name}.stale`).toBeGreaterThanOrEqual(300)
      expect(life.expire, `${name}.expire`).toBeGreaterThanOrEqual(300)
      expect(life.revalidate, `${name}.revalidate`).toBeGreaterThan(0)
      expect(life.expire, `${name}: expire must exceed revalidate`).toBeGreaterThan(life.revalidate)
    }
  })
})

describe('isKnownCacheTag', () => {
  it('accepts the fixed tags and well-formed entity tags', () => {
    expect(isKnownCacheTag('catalogue')).toBe(true)
    expect(isKnownCacheTag('home')).toBe(true)
    expect(isKnownCacheTag(`product:${PRODUCT_ID}`)).toBe(true)
    expect(isKnownCacheTag('category:hot-deals')).toBe(true)
  })

  it('rejects arbitrary strings, empty entities and oversized tags', () => {
    expect(isKnownCacheTag('')).toBe(false)
    expect(isKnownCacheTag('posts')).toBe(false)
    expect(isKnownCacheTag('product:')).toBe(false)
    expect(isKnownCacheTag('product:../x')).toBe(false)
    expect(isKnownCacheTag(`product:${'a'.repeat(MAX_CACHE_TAG_LENGTH)}`)).toBe(false)
  })
})

describe('cacheTagsForChange: products', () => {
  it('INSERT stales the product, the umbrella, every list, home, feeds, its category, its supplier and the sitemap', () => {
    const tags = cacheTagsForChange({ type: 'INSERT', table: 'products', record: product() })
    expect(tags).toEqual([
      `product:${PRODUCT_ID}`,
      'catalogue',
      'product-list',
      'home',
      'feed',
      `category:${CATEGORY_ID}`,
      `supplier:${SUPPLIER_ID}`,
      'sitemap',
    ])
  })

  it('DELETE reads the row from old_record and stales the same set', () => {
    const tags = cacheTagsForChange({
      type: 'DELETE',
      table: 'products',
      record: null,
      old_record: product(),
    })
    expect(tags).toContain(`product:${PRODUCT_ID}`)
    expect(tags).toContain('catalogue')
    expect(tags).toContain(`category:${CATEGORY_ID}`)
    expect(tags).toContain('sitemap')
  })

  /**
   * The case the whole per-entity design exists for: every sale decrements
   * `stock_quantity`, the webhook fires, and the only thing that should move
   * is the one product page, in the background.
   */
  it('a stock-only UPDATE stales the product tag and nothing else', () => {
    const tags = cacheTagsForChange({
      type: 'UPDATE',
      table: 'products',
      record: product({ stock_quantity: 9, updated_at: '2026-10-07T20:01:00.000Z' }),
      old_record: product(),
    })
    expect(tags).toEqual([`product:${PRODUCT_ID}`])
  })

  it('a price UPDATE stales the lists and home but not the sitemap', () => {
    const tags = cacheTagsForChange({
      type: 'UPDATE',
      table: 'products',
      record: product({ kenyon_price: 9900 }),
      old_record: product(),
    })
    expect(tags).toContain('catalogue')
    expect(tags).toContain('product-list')
    expect(tags).toContain('home')
    expect(tags).toContain('feed')
    expect(tags).not.toContain('sitemap')
  })

  it('a status or slug UPDATE stales the sitemap', () => {
    for (const change of [{ status: 'draft' }, { slug: 'renamed' }, { deleted_at: '2026-10-07' }]) {
      const tags = cacheTagsForChange({
        type: 'UPDATE',
        table: 'products',
        record: product(change),
        old_record: product(),
      })
      expect(tags, JSON.stringify(change)).toContain('sitemap')
    }
  })

  it('a category move stales both the old and the new category', () => {
    const tags = cacheTagsForChange({
      type: 'UPDATE',
      table: 'products',
      record: product({ category_id: OTHER_CATEGORY_ID }),
      old_record: product(),
    })
    expect(tags).toContain(`category:${OTHER_CATEGORY_ID}`)
    expect(tags).toContain(`category:${CATEGORY_ID}`)
    expect(tags.filter((t) => t.startsWith('category:'))).toHaveLength(2)
  })

  it('a row with no id stales nothing, so a malformed delivery cannot purge the catalogue', () => {
    expect(
      cacheTagsForChange({ type: 'INSERT', table: 'products', record: { slug: 'x' } }),
    ).toEqual([])
    expect(cacheTagsForChange({ type: 'DELETE', table: 'products', old_record: null })).toEqual([])
  })

  it('never emits a duplicate tag', () => {
    const tags = cacheTagsForChange({
      type: 'UPDATE',
      table: 'products',
      record: product({ kenyon_price: 1 }),
      old_record: product(),
    })
    expect(new Set(tags).size).toBe(tags.length)
  })
})

describe('cacheTagsForChange: categories', () => {
  it('INSERT stales the category, the umbrella, lists, home and the sitemap', () => {
    const tags = cacheTagsForChange({
      type: 'INSERT',
      table: 'categories',
      record: { id: CATEGORY_ID, slug: 'new', is_active: true, parent_id: null },
    })
    expect(tags).toEqual([
      `category:${CATEGORY_ID}`,
      'catalogue',
      'product-list',
      'home',
      'sitemap',
    ])
  })

  it('a rename of the display name stales the lists but not the sitemap', () => {
    const tags = cacheTagsForChange({
      type: 'UPDATE',
      table: 'categories',
      record: { id: CATEGORY_ID, slug: 'same', name_he: 'חדש', is_active: true },
      old_record: { id: CATEGORY_ID, slug: 'same', name_he: 'ישן', is_active: true },
    })
    expect(tags).toContain(`category:${CATEGORY_ID}`)
    expect(tags).toContain('home')
    expect(tags).not.toContain('sitemap')
  })

  it('a re-parenting stales both parents', () => {
    const tags = cacheTagsForChange({
      type: 'UPDATE',
      table: 'categories',
      record: { id: CATEGORY_ID, slug: 's', parent_id: OTHER_CATEGORY_ID },
      old_record: { id: CATEGORY_ID, slug: 's', parent_id: SUPPLIER_ID },
    })
    expect(tags).toContain(`category:${OTHER_CATEGORY_ID}`)
    expect(tags).toContain(`category:${SUPPLIER_ID}`)
    expect(tags).toContain('sitemap')
  })
})

describe('cacheTagsForChange: other tables', () => {
  it('stales nothing for a table the storefront does not cache', () => {
    expect(
      cacheTagsForChange({ type: 'UPDATE', table: 'orders', record: { id: PRODUCT_ID } }),
    ).toEqual([])
  })
})
