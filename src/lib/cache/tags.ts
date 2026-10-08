import { CATALOGUE_TAG } from '@/lib/catalogue-cache'

/**
 * The cache tags and lifetimes of every `use cache` read on the storefront,
 * in one place, and the pure function that turns a database change into the
 * tags it stales.
 *
 * Before STEP 36 every catalogue read carried ONE tag (`catalogue`) and one
 * life (`hours`). That was correct and coarse: an admin save expired the
 * whole storefront through `updateTag(CATALOGUE_TAG)`, and a write that did
 * not go through a server action (SQL, the till app, a CSV import, the stock
 * decrement in `server/payments/finalize.ts`) expired nothing for an hour.
 *
 * Two things change here, and both are additive to that contract:
 *
 * 1. EVERY READ STILL CARRIES `CATALOGUE_TAG`. The umbrella is what the admin
 *    actions expire, and it keeps working unchanged. The per-entity tags
 *    below are a SECOND, narrower handle on the same entries, for the paths
 *    that know exactly which row moved and must not empty the whole cache
 *    to say so: the Supabase Database Webhook on `products` / `categories`
 *    (`/api/webhooks/products`) and the on-demand endpoint (`/api/revalidate`).
 *
 * 2. The lifetimes are the route matrix in ARCHITECTURE-PERFORMANCE.md §2.1,
 *    not a preset. `stale` is 300 everywhere on purpose: under 300 a cached
 *    scope leaves the route's app shell (cacheLife docs, "Prerendering
 *    behavior"), and `expire` under 300 makes it a dynamic hole. `revalidate`
 *    is the part that varies, and it is what Next writes into the page's CDN
 *    header as `s-maxage`, with `expire - revalidate` as the
 *    `stale-while-revalidate` window. That header IS the "SWR for lists":
 *    a category page a minute past its window is served from the edge while
 *    the origin recomputes it, and only a page a day old blocks.
 *
 * Inline objects, not named profiles in next.config: a custom name is only
 * typed once `next build` has regenerated `.next/types/cache-life.d.ts`, so
 * `pnpm type-check` on a fresh checkout would reject a name the build
 * accepts (category-page.ts header, and the memory note that found it).
 *
 * `cacheTag` / `cacheLife` are still written out in every cached function
 * rather than wrapped: they are directives about the scope they appear in,
 * and a helper would make it possible to add a `use cache` read that has
 * neither. What this module provides is the VALUES, so a tag string cannot
 * be mistyped at one call site and silently never match its revalidation.
 */

/** A cache tag may be at most 256 characters; a longer one is dropped, silently. */
export const MAX_CACHE_TAG_LENGTH = 256

export const CacheTags = {
  /** The umbrella every storefront read carries. Expired by every admin write. */
  catalogue: CATALOGUE_TAG,
  /** Everything on `/` below the hero: tiles, deal of the day, hot coupons. */
  home: 'home',
  /** `/sitemap.xml`. Staled by anything that adds, removes or renames a URL. */
  sitemap: 'sitemap',
  /** `/feed.xml` and `/merchant.xml`. */
  feed: 'feed',
  /** Every paginated grid: `/products`, `/category/[slug]`, `/s/[id]`. */
  productList: 'product-list',
  /** One product's own reads: detail, SEO row, related strip, similar coupons. */
  product: (id: string) => `product:${id}` as const,
  /** One category's reads: its row, its grid, its brand facets, its children. */
  category: (id: string) => `category:${id}` as const,
  /** One supplier's storefront: the header card and its grid. */
  supplier: (id: string) => `supplier:${id}` as const,
  /** Every campaign landing page (`/lp/[slug]`, STEP 55). Expired by every admin save. */
  landing: 'landing',
  /** One landing page's own read, by slug. */
  landingPage: (slug: string) => `landing:${slug}` as const,
} as const

/**
 * The route matrix (ARCHITECTURE-PERFORMANCE.md §2.1), as `cacheLife` inputs.
 * `stale` is pinned at 300 and `expire` at a day for the reasons in the header.
 */
export const CacheLife = {
  /** `/`: featured deals rotate and `valid_until` expires without an admin. */
  home: { stale: 300, revalidate: 120, expire: 86400 },
  /** `/product/[slug]` and the strips under it: price, stock and gallery edits are common. */
  product: { stale: 300, revalidate: 120, expire: 86400 },
  /** `/category/[slug]` and `/s/[id]`: listing churn is slower than a price edit. */
  list: { stale: 300, revalidate: 300, expire: 86400 },
  /** `/products`, the whole-shop grid. */
  productsIndex: { stale: 300, revalidate: 180, expire: 86400 },
  /** `/sitemap.xml`, `/feed.xml`, `/merchant.xml`: crawled, never browsed. */
  sitemap: { stale: 300, revalidate: 3600, expire: 86400 },
} as const satisfies Record<string, { stale: number; revalidate: number; expire: number }>

const ENTITY_TAG = /^(product|category|supplier|landing):[A-Za-z0-9][A-Za-z0-9_-]{0,200}$/

/**
 * True for a tag this module could have produced. `/api/revalidate` accepts
 * only these: a caller holding the secret can stale the storefront, which is
 * the point, but cannot stale an arbitrary string, which keeps the endpoint
 * describing the cache it fronts rather than any cache Next happens to hold.
 */
export function isKnownCacheTag(tag: string): boolean {
  if (tag.length === 0 || tag.length > MAX_CACHE_TAG_LENGTH) return false
  if (
    tag === CacheTags.catalogue ||
    tag === CacheTags.home ||
    tag === CacheTags.sitemap ||
    tag === CacheTags.feed ||
    tag === CacheTags.productList ||
    tag === CacheTags.landing
  ) {
    return true
  }
  return ENTITY_TAG.test(tag)
}

/** The shape `/api/webhooks/products` already validates (lib/search/pipeline-contracts). */
export interface DbChangeLike {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
}

/**
 * Columns whose change moves nothing a shopper can see on a LIST, so an
 * UPDATE that touches only these stales the product's own tag and nothing
 * else. `stock_quantity` is the one that matters: `finalize.ts` decrements it
 * on every sale, the database webhook fires on every decrement, and staling
 * the whole catalogue per sale would empty the cache exactly when the shop
 * is busy (the contract in catalogue-cache.ts). With a per-product tag the
 * sale refreshes one product page in the background, which is the behaviour
 * the contract wanted and could not have.
 */
const PRODUCT_LIST_NEUTRAL_COLUMNS = new Set([
  'stock_quantity',
  'stock_initial',
  'low_stock_threshold',
  'updated_at',
  'search_vector',
  'approval_note',
  'approved_at',
  'approved_by',
  'submitted_at',
  'created_by',
  'latitude',
  'longitude',
])

/** Columns whose change adds, removes or renames a URL the sitemap and feeds list. */
const PRODUCT_URL_COLUMNS = new Set(['slug', 'status', 'deleted_at', 'published_at'])
const CATEGORY_URL_COLUMNS = new Set(['slug', 'is_active', 'deleted_at', 'parent_id'])

function str(row: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = row?.[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function changedColumns(
  record: Record<string, unknown> | null | undefined,
  old: Record<string, unknown> | null | undefined,
): Set<string> {
  const keys = new Set([...Object.keys(record ?? {}), ...Object.keys(old ?? {})])
  const out = new Set<string>()
  for (const key of keys) {
    if (JSON.stringify(record?.[key] ?? null) !== JSON.stringify(old?.[key] ?? null)) out.add(key)
  }
  return out
}

/**
 * The tags a database change stales. Pure, and the only place the mapping
 * lives, so the webhook route and its tests agree by construction.
 *
 * - `products`: always the product's own tag. Anything beyond the
 *   list-neutral columns also stales the umbrella, every list, the category
 *   it is in (both the old and the new one on a move), its supplier's
 *   storefront, the feeds, and `home` (every home widget reads products).
 *   A URL-shaping change (slug, status, soft delete, publish) stales the
 *   sitemap too. INSERT and DELETE are the full set: a row that appears or
 *   disappears is on every list it qualifies for.
 * - `categories`: the category's own tag, the umbrella, every list, home
 *   (the tile grid) and the sitemap on a URL-shaping change. A product move
 *   is a `products` change, so the category's tag is staled from there.
 * - Any other table: nothing. The webhook acknowledges and queues nothing.
 *
 * Returned in a stable order with no duplicates so a response body or a log
 * line can be compared verbatim.
 */
export function cacheTagsForChange(change: DbChangeLike): string[] {
  const tags: string[] = []
  const add = (tag: string | null | undefined) => {
    if (tag && tag.length <= MAX_CACHE_TAG_LENGTH && !tags.includes(tag)) tags.push(tag)
  }
  const row = change.type === 'DELETE' ? change.old_record : change.record
  const old = change.type === 'UPDATE' ? change.old_record : null

  if (change.table === 'products') {
    const id = str(row, 'id') ?? str(old, 'id')
    if (!id) return []
    add(CacheTags.product(id))

    const changed = change.type === 'UPDATE' ? changedColumns(change.record, old) : null
    const listNeutral =
      changed !== null && [...changed].every((col) => PRODUCT_LIST_NEUTRAL_COLUMNS.has(col))
    if (listNeutral) return tags

    add(CacheTags.catalogue)
    add(CacheTags.productList)
    add(CacheTags.home)
    add(CacheTags.feed)
    const categoryId = str(row, 'category_id')
    const oldCategoryId = str(old, 'category_id')
    if (categoryId) add(CacheTags.category(categoryId))
    if (oldCategoryId && oldCategoryId !== categoryId) add(CacheTags.category(oldCategoryId))
    const supplierId = str(row, 'supplier_id')
    const oldSupplierId = str(old, 'supplier_id')
    if (supplierId) add(CacheTags.supplier(supplierId))
    if (oldSupplierId && oldSupplierId !== supplierId) add(CacheTags.supplier(oldSupplierId))
    const urlShaping = changed === null || [...changed].some((col) => PRODUCT_URL_COLUMNS.has(col))
    if (urlShaping) add(CacheTags.sitemap)
    return tags
  }

  if (change.table === 'categories') {
    const id = str(row, 'id') ?? str(old, 'id')
    if (!id) return []
    add(CacheTags.category(id))
    add(CacheTags.catalogue)
    add(CacheTags.productList)
    add(CacheTags.home)
    const changed = change.type === 'UPDATE' ? changedColumns(change.record, old) : null
    const urlShaping = changed === null || [...changed].some((col) => CATEGORY_URL_COLUMNS.has(col))
    if (urlShaping) add(CacheTags.sitemap)
    const parentId = str(row, 'parent_id')
    const oldParentId = str(old, 'parent_id')
    if (parentId) add(CacheTags.category(parentId))
    if (oldParentId && oldParentId !== parentId) add(CacheTags.category(oldParentId))
    return tags
  }

  return []
}
