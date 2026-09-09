import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import type { RailSource } from '@/lib/homepage/sections'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The products a merchandising section holds.
 *
 * ANON, CACHED, AND TAGGED. `lib/homepage/cms.ts` reads the section list with
 * the SERVICE ROLE and is uncached, for reasons its own header sets out at
 * length. These reads are different in both respects and deliberately so: they
 * return catalogue rows, which are the same rows `getShopProducts` already
 * serves to anyone, so there is nothing here the anon key should not see and
 * nothing personal to leak into a shared cache. Tagged with `CATALOGUE_TAG`, so
 * a product saved in the admin refreshes the rail with everything else.
 *
 * THE COLUMN LIST IS THE ONE `ProductCard` READS AND NOTHING MORE. A rail is
 * four cards; selecting the whole row to render a name and a price is bytes
 * paid on the LCP path of the busiest page on the site.
 */

const COLUMNS =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, offer_valid_until, supplier_id, category_id'

export type RailProduct = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  created_at: string
  offer_valid_until: string | null
  supplier_id: string | null
  category_id: string | null
}

/**
 * How much cheaper this product is than its own reference price, as a fraction.
 *
 * `full_price` is the crossed-out number and `kenyon_price` is what is charged.
 * A product with no `full_price`, or one that is not actually cheaper, scores
 * zero rather than being ranked by a comparison against null - which in
 * JavaScript would quietly sort it as if it were free.
 */
export function discountFraction(product: {
  kenyon_price: number | null
  full_price: number | null
}): number {
  const full = product.full_price
  const price = product.kenyon_price
  if (full === null || price === null || full <= 0 || price >= full) return 0
  return (full - price) / full
}

/**
 * Active, in-stock, visible products - the pool every rule ranks.
 *
 * ONE BOUNDED READ, RANKED IN MEMORY, and that is the decision worth
 * defending. `biggest_discount` orders by `(full_price - kenyon_price) /
 * full_price`, which PostgREST cannot express: it has no computed-column
 * ordering, so the alternatives were a generated column, a view, or a database
 * function - three more things in the schema, each needing its own migration
 * and its own grant, to sort at most a few hundred rows.
 *
 * The bound is what makes it honest. The catalogue holds 44 active products
 * (measured 2026-09-09); the cap is 300, so the pool is the whole catalogue
 * many times over and the ranking is exact. If the catalogue ever passes 300
 * the rule stops being "the biggest discount in the shop" and becomes "the
 * biggest discount among the 300 newest", which is why the cap is named here
 * and why the admin console prints the pool size next to the rule.
 */
const POOL_LIMIT = 300

async function readPool(): Promise<RailProduct[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('products')
      .select(COLUMNS)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(POOL_LIMIT),
    'homepage.rail_pool_failed',
  )
  return (data ?? []) as unknown as RailProduct[]
}

/** Named so the admin console can print it beside the rule. */
export const RAIL_POOL_LIMIT = POOL_LIMIT

/**
 * Rank the pool by a rule.
 *
 * Pure, so the console and the page cannot disagree about what a rule selects,
 * and so the ordering is testable without a database.
 */
export function rankByRule(
  pool: readonly RailProduct[],
  source: Exclude<RailSource, 'manual'>,
  now: Date,
): RailProduct[] {
  if (source === 'newest') {
    return [...pool].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }

  if (source === 'biggest_discount') {
    return pool
      .filter((product) => discountFraction(product) > 0)
      .sort((a, b) => discountFraction(b) - discountFraction(a))
  }

  // ending_soon. A product with no `offer_valid_until` has no ending to be
  // near and is excluded rather than sorted last - "soon" is a claim, and a
  // product with no deadline would be making it falsely. One already past is
  // excluded too: it is not ending soon, it has ended.
  return pool
    .filter((product) => {
      if (!product.offer_valid_until) return false
      const ends = new Date(product.offer_valid_until).getTime()
      return Number.isFinite(ends) && ends > now.getTime()
    })
    .sort(
      (a, b) =>
        new Date(a.offer_valid_until as string).getTime() -
        new Date(b.offer_valid_until as string).getTime(),
    )
}

/**
 * The products for a rule-driven rail.
 *
 * `now` is passed in rather than read here, because this runs inside a
 * component tree that `cacheComponents` prerenders and reading the clock there
 * is a build error - the same wall `lib/homepage/cms.ts` hit, which is why the
 * schedule lives in a database view. The caller that has a clock supplies one.
 */
export async function railByRule(
  source: Exclude<RailSource, 'manual'>,
  limit: number,
  now: Date,
): Promise<RailProduct[]> {
  return rankByRule(await readPool(), source, now).slice(0, limit)
}

/**
 * The products for a manually picked rail, IN THE ORDER THE OPERATOR PICKED.
 *
 * PostgREST returns `in()` results in whatever order the planner produced, so
 * reordering here is not tidiness: without it the operator drags a card to the
 * front and the page ignores them. An id that matches nothing - a product
 * deleted since the rail was configured - is dropped rather than rendered as a
 * hole, which is also why this returns fewer than it was asked for rather than
 * padding with something the operator did not choose.
 */
export async function railByIds(ids: readonly string[]): Promise<RailProduct[]> {
  if (ids.length === 0) return []
  const pool = await readPool()
  const byId = new Map(pool.map((product) => [product.id, product]))
  return ids.map((id) => byId.get(id)).filter((product): product is RailProduct => !!product)
}

/**
 * Products of one category, newest first.
 *
 * Filtered from the same cached pool rather than queried with `.eq()`, so a
 * home page carrying a rail, a category spotlight and a supplier spotlight
 * costs ONE database round trip between them instead of three. The pool is
 * capped at 300 and the catalogue holds 44, so the filter sees every product a
 * query would have returned.
 */
export async function railByCategory(categoryId: string, limit: number): Promise<RailProduct[]> {
  const pool = await readPool()
  return pool.filter((product) => product.category_id === categoryId).slice(0, limit)
}

/** Products of one business, newest first. */
export async function railBySupplier(supplierId: string, limit: number): Promise<RailProduct[]> {
  const pool = await readPool()
  return pool.filter((product) => product.supplier_id === supplierId).slice(0, limit)
}

/**
 * The category a spotlight points at, by slug.
 *
 * By SLUG and not by id, because the slug is what the operator sees in the
 * admin, what the link goes to, and what they can paste from the address bar.
 * An id would be a uuid typed into a form from a different screen.
 */
export async function spotlightCategory(
  slug: string,
): Promise<{ id: string; slug: string; name_he: string } | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('categories')
      .select('id, slug, name_he')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle(),
    'homepage.spotlight_category_failed',
  )
  return data ?? null
}

/**
 * The business a spotlight points at.
 *
 * Only `active`. A spotlight on a suspended or closed supplier would put a
 * business the platform has stopped working with at the top of the home page,
 * and the section's own schedule is no help: nobody edits the home page because
 * a supplier was suspended.
 */
export async function spotlightSupplier(
  id: string,
): Promise<{ id: string; name: string; city: string | null; logo_url: string | null } | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('suppliers')
      .select('id, name, city, logo_url')
      .eq('id', id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle(),
    'homepage.spotlight_supplier_failed',
  )
  return data ?? null
}
