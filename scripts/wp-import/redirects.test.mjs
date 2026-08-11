// Redirect map tests.
//
// Each of the first four cases is a bug that reached the branch and was found
// by running the pipeline, not by reading it (STATE.md, 2026-07-29). They are
// pinned here because every one of them is silent: the import succeeds, the
// counts look right, and the damage only shows up as lost traffic or, in the
// collision case, a customer buying the wrong product.

import { describe, expect, it } from 'vitest'
import { buildUrlInventory, normalizePath } from './02-transform.mjs'

/** A staging product row, in the shape transformProducts emits. */
const product = (over = {}) => ({
  wp_post_id: 101,
  post_type: 'product',
  slug_raw: 'meal',
  slug_decoded: 'meal',
  proposed_slug: 'meal',
  permalink: '/product/meal',
  raw_post: {},
  raw_meta: {},
  ...over,
})

const category = (over = {}) => ({
  wp_term_id: 21,
  slug_raw: 'restaurants',
  slug_decoded: 'restaurants',
  proposed_slug: 'restaurants',
  permalink: '/product-category/restaurants',
  ...over,
})

const find = (rows, oldPath) => rows.find((r) => r.old_path === oldPath)

describe('redirect targets point at routes that exist', () => {
  it('sends products to /product and categories to /category', () => {
    const rows = buildUrlInventory([product()], [category()])
    // The prefixes came from config.ROUTES precisely so a route rename cannot
    // silently retarget the whole catalogue at a 404.
    expect(find(rows, '/product/meal').mapped_new_path).toBe('/product/meal')
    expect(find(rows, '/product-category/restaurants').mapped_new_path).toBe(
      '/category/restaurants',
    )
  })
})

describe('a redirect never points at itself', () => {
  it('flags an unchanged path as a direct match', () => {
    // /product/meal -> /product/meal is a loop that takes a working page down.
    const rows = buildUrlInventory([product()], [])
    expect(find(rows, '/product/meal').direct_match).toBe(true)
  })

  it('does not flag a path whose slug the dedupe changed', () => {
    const rows = buildUrlInventory([product({ proposed_slug: 'meal-2' })], [])
    const row = find(rows, '/product/meal')
    expect(row.direct_match).toBe(false)
    expect(row.mapped_new_path).toBe('/product/meal-2')
  })

  it('compares paths after decoding, case and trailing slash', () => {
    expect(normalizePath('/product/Meal/')).toBe(normalizePath('/product/meal'))
    expect(normalizePath('/product/%d7%90')).toBe('/product/א')
    expect(normalizePath('/product/meal?utm=x#frag')).toBe('/product/meal')
  })

  it('leaves a malformed percent sequence alone instead of throwing', () => {
    expect(() => normalizePath('/product/%E0%A4%A')).not.toThrow()
  })
})

describe('the target is the slug actually stored, not the pre-dedupe one', () => {
  it('sends a collision loser to its own new slug, never to the winner', () => {
    // Both products decoded to `meal`. The loser was renamed `meal-2`. Building
    // the target from slug_decoded pointed the loser's old URL at the winner's
    // page, so an old link sold the wrong product.
    const winner = product({ wp_post_id: 101, permalink: '/product/meal' })
    const loser = product({
      wp_post_id: 102,
      slug_raw: 'meal-old',
      slug_decoded: 'meal',
      proposed_slug: 'meal-2',
      permalink: '/product/meal-old',
    })

    const rows = buildUrlInventory([winner, loser], [])
    expect(find(rows, '/product/meal-old').mapped_new_path).toBe('/product/meal-2')
    expect(find(rows, '/product/meal').mapped_new_path).toBe('/product/meal')
  })
})

describe('every slug a post ever had gets a row', () => {
  it('emits a redirect per _wp_old_slug, from both the post and the meta', () => {
    const rows = buildUrlInventory(
      [
        product({
          raw_post: { old_slugs: ['meal-for-two'] },
          raw_meta: { _wp_old_slug: ['dinner-deal', 'early-name'] },
        }),
      ],
      [],
    )

    for (const slug of ['meal-for-two', 'dinner-deal', 'early-name']) {
      const row = find(rows, `/product/${slug}`)
      expect(row, slug).toBeDefined()
      expect(row.mapped_new_path).toBe('/product/meal')
      expect(row.mapping_rule).toBe('wp_old_slug')
      expect(row.direct_match).toBe(false)
    }
  })

  it('accepts a scalar meta value, which is what one occurrence looks like', () => {
    const rows = buildUrlInventory([product({ raw_meta: { _wp_old_slug: 'dinner-deal' } })], [])
    expect(find(rows, '/product/dinner-deal')).toBeDefined()
  })

  it('does not emit an old slug that equals the current one', () => {
    const rows = buildUrlInventory([product({ raw_post: { old_slugs: ['meal'] } })], [])
    expect(rows.filter((r) => r.old_path === '/product/meal')).toHaveLength(1)
  })
})

describe('excluded products are gone, not missing', () => {
  it('marks a product we chose not to import as 410 with no target', () => {
    const rows = buildUrlInventory(
      [],
      [],
      [{ wp_post_id: 104, permalink: '/product/trashed', status_raw: 'trash' }],
    )
    const row = find(rows, '/product/trashed')
    expect(row.gone_410).toBe(true)
    expect(row.mapped_new_path).toBeNull()
    // The reason travels with the row: Search Console tells a decision and an
    // oversight apart, and a 404 reads as an oversight.
    expect(row.mapping_rule).toBe('excluded_status:trash')
  })
})

describe('the inventory is safe to load into a unique-keyed table', () => {
  it('keeps one row per old path when a parent and child collide', () => {
    const rows = buildUrlInventory(
      [],
      [
        category({ wp_term_id: 21, permalink: '/product-category/food' }),
        category({ wp_term_id: 22, slug_decoded: 'sushi', permalink: '/product-category/food' }),
      ],
    )
    expect(rows.filter((r) => r.old_path === '/product-category/food')).toHaveLength(1)
  })

  it('drops a row whose old path is not relative', () => {
    // seo_redirects enforces this too, but an absolute path here would mean the
    // whole batch fails the constraint instead of one bad row being skipped.
    const rows = buildUrlInventory(
      [product({ permalink: 'https://kenyonexpress.co.il/product/meal' })],
      [],
    )
    expect(rows.every((r) => r.old_path.startsWith('/'))).toBe(true)
  })

  it('skips a product with no usable slug rather than emitting /product/', () => {
    const rows = buildUrlInventory(
      [product({ slug_raw: null, slug_decoded: null, proposed_slug: null })],
      [],
    )
    expect(rows.find((r) => r.old_path === '/product/')).toBeUndefined()
  })

  it('ignores variations, which have no public url', () => {
    const rows = buildUrlInventory([product({ post_type: 'product_variation' })], [])
    expect(rows).toHaveLength(0)
  })

  it('falls back to the raw slug when a product has no permalink', () => {
    const rows = buildUrlInventory([product({ permalink: null, slug_raw: 'meal-raw' })], [])
    expect(find(rows, '/product/meal-raw')).toBeDefined()
  })
})

describe('no post may claim the site root', () => {
  // The 2026-07-29 export carries wp_id 6810, a private copy of a Pampers
  // listing whose permalink is `/?post_type=product&p=6810`. Query strings are
  // stripped, so its old path became `/` and the shipped inventory redirected
  // the old homepage to a duplicate nappies page. The counts all looked right.
  it('falls back to the slug when a permalink is only the site root', () => {
    const rows = buildUrlInventory(
      [product({ permalink: 'https://kenyonexpress.co.il/', slug_raw: 'nappies-copy' })],
      [],
    )
    expect(find(rows, '/')).toBeUndefined()
    expect(find(rows, '/product/nappies-copy').mapped_new_path).toBe('/product/meal')
  })

  it('does the same for a category', () => {
    const rows = buildUrlInventory([], [category({ permalink: 'https://kenyonexpress.co.il/' })])
    expect(find(rows, '/')).toBeUndefined()
    expect(find(rows, '/product-category/restaurants')).toBeDefined()
  })
})

/** A WXR page item, in the shape lib/wxr emits. */
const page = (over = {}) => ({
  id: 3134,
  slug: 'cart',
  title: 'סל הקניות',
  link: 'https://kenyonexpress.co.il/cart/',
  status: 'publish',
  post_type: 'page',
  ...over,
})

describe('pages are in the inventory, not omitted from it', () => {
  // Until 2026-08-01 buildUrlInventory took products and categories only, so
  // redirect_coverage scored 76/76 while 27 published pages sat outside the set
  // being counted. A gate that passes by leaving rows out is worse than one that
  // fails: it says the site is safe to cut over while /privacy-policy/ is about
  // to start 404ing.
  it('maps a page listed in PAGE_REDIRECTS', () => {
    const rows = buildUrlInventory([], [], [], [page({ id: 3853, slug: 'shop', link: '/shop/' })])
    expect(find(rows, '/shop').mapped_new_path).toBe('/products')
    expect(find(rows, '/shop').mapping_rule).toBe('page_redirect')
  })

  it('gives a page whose feature is gone an explicit 410, not a redirect home', () => {
    // A 301 to the homepage is a soft 404: the old URL stays indexed and the
    // customer lands somewhere that does not answer them.
    const rows = buildUrlInventory([], [], [], [page({ id: 307, slug: 'blog', link: '/blog/' })])
    expect(find(rows, '/blog').gone_410).toBe(true)
    expect(find(rows, '/blog').mapped_new_path).toBeNull()
  })

  it('flags a page nobody has mapped instead of quietly covering it', () => {
    const rows = buildUrlInventory(
      [],
      [],
      [],
      [page({ id: 3, slug: 'privacy-policy', link: '/privacy-policy/' })],
    )
    const row = find(rows, '/privacy-policy')
    expect(row.mapping_rule).toBe('page_unmapped')
    // This is what redirect_coverage counts as unresolved.
    expect(row.mapped_new_path).toBeNull()
    expect(row.direct_match).toBe(false)
    expect(row.gone_410).toBe(false)
  })

  it('treats a page whose path already matches as a direct match', () => {
    const rows = buildUrlInventory([], [], [], [page()])
    expect(find(rows, '/cart').direct_match).toBe(true)
  })

  it('matches a percent-encoded Hebrew page slug against the map', () => {
    const rows = buildUrlInventory(
      [],
      [],
      [],
      [
        page({
          id: 6655,
          slug: 'דף-בית-טסט',
          link: '/%d7%93%d7%a3-%d7%91%d7%99%d7%aa-%d7%98%d7%a1%d7%98/',
        }),
      ],
    )
    expect(rows[0].mapped_new_path).toBe('/')
  })

  it('keeps the published front page as a direct match at the root', () => {
    const rows = buildUrlInventory([], [], [], [page({ id: 5202, slug: 'home-v7-el', link: '/' })])
    expect(find(rows, '/').direct_match).toBe(true)
    expect(find(rows, '/').mapped_new_path).toBe('/')
  })

  it('drops a draft page whose only link is /?page_id=, which was never indexed', () => {
    const rows = buildUrlInventory(
      [],
      [],
      [],
      [page({ id: 6653, slug: 'דף-הבית-7', link: '/?page_id=6653', status: 'draft' })],
    )
    expect(rows).toHaveLength(0)
  })
})
