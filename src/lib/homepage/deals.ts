import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The home page deals grid, read from the catalogue.
 *
 * UNTIL Q03 (2026-09-25) THE GRID WAS A FIXTURE. `KE_LIVE_DEALS` is a verbatim
 * capture of the 32 cards the live site rendered on 2026-08-12, and
 * `DealsOfTheDay` rendered it and nothing else, so the busiest page on the site
 * sold from a snapshot: synthetic ids the cart refused ("מזהה לא תקין" on every
 * add, see add-to-cart-refusal.test.tsx), prices frozen on the capture date,
 * and no supplier and no city on any card. The grid now renders the rows the
 * shop actually sells, and the fixture is the fallback and the ORDER.
 *
 * THE ORDER IS LIVE'S ORDER, SLOT BY SLOT, ON PURPOSE. The comparison gate
 * diffs this page against the frozen live captures band by band, and a product
 * grid in a different order is a different picture on every band it covers.
 * Measured 2026-09-25: 29 of the 32 live slugs are active rows here. Each of
 * live's 32 slots holds live's product when the catalogue has it; a slot whose
 * product the catalogue does not have takes the newest row live never showed,
 * so the 29 that match stay in the column and row the captures have them in.
 * (Appending the fill-ins at the end instead moved every card after the first
 * hole one column over: at 768 that is every card from row three down on the
 * other side of the page, and the grid bands read 50-68% on the same photos.)
 * Anything left over follows, newest first, and the grid is capped at live's
 * 32 so the page keeps the height the three captures were taken at. That is a
 * merchandising order the operator chose on the live site, not an invention
 * here, and it is one line of code away from "newest first" when the CMS takes
 * it over.
 *
 * A CARD NEEDS A PICTURE. Live's grid has no imageless card, and the e2e
 * fixtures (`e2e-test-physical`, `e2e-test-coupon`) are active rows with
 * `images: []` that would otherwise be the two newest products in the shop and
 * land on the home page of every visitor. The filter is on the picture, not on
 * the slug prefix, because a real product uploaded without a picture is the
 * same defect from the visitor's side.
 *
 * ANON, CACHED, TAGGED. Same reasoning as `rails.ts` beside this file: these
 * are catalogue rows anyone may read, so the anon key is the right key and a
 * shared cache leaks nothing. `CATALOGUE_TAG` means a product saved in the
 * admin refreshes the grid with everything else. `orFail` throws on a failed
 * read so the scope is not cached (catalogue-read.ts explains the empty-shop
 * failure that motivates it), and the caller falls back to the fixture, which
 * is the last good grid this page is known to have painted.
 */

/** Live renders 32 cards: 8 rows of 4 at 1440, 16 of 2 at 768, 32 of 1 at 380. */
export const HOME_DEALS_COUNT = 32

/**
 * What `ProductDealCard` renders. `city` is the meta line under the category:
 * the product's own `city` when the operator set one, else the business's.
 */
export type HomeDeal = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  category: { name_he: string; slug: string } | null
  city: string | null
}

type CategoryJoin = { name_he: string; slug: string }
type SupplierJoin = { city: string | null }

/** One row as PostgREST returns it; joins may come back as object or array. */
export type HomeDealRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  created_at: string
  city: string | null
  categories: CategoryJoin | CategoryJoin[] | null
  suppliers: SupplierJoin | SupplierJoin[] | null
}

// `city` on products exists in production (the generated types say so and a
// filtered read on it answers 200). `suppliers(city)` is the join the category
// page already makes; `latitude`/`longitude` are NOT selected for the reason
// category-page.ts gives: 136 is not applied and a missing column fails the
// whole select.
const COLUMNS =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, city, categories!products_category_id_fkey(name_he, slug), suppliers(city)'

// The same bound as the rails' pool, and for the same reason: 46 active rows
// today, ranked in memory, exact many times over.
const POOL_LIMIT = 300

const LIVE_ORDER: ReadonlyMap<string, number> = new Map(
  KE_LIVE_DEALS.map((deal, index) => [deal.slug, index]),
)

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function trimmed(value: string | null | undefined): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

/** True when the row has a first image the card can paint. */
export function hasThumbnail(images: unknown): boolean {
  return Array.isArray(images) && typeof images[0] === 'string' && images[0].length > 0
}

export function toHomeDeal(row: HomeDealRow): HomeDeal {
  const category = first(row.categories)
  const supplier = first(row.suppliers)
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    kenyon_price: row.kenyon_price,
    full_price: row.full_price,
    images: row.images,
    stock_quantity: row.stock_quantity,
    category: category ? { name_he: category.name_he, slug: category.slug } : null,
    city: trimmed(row.city) ?? trimmed(supplier?.city) ?? null,
  }
}

/**
 * Pure, so the order is testable without a database and the page and a test
 * cannot disagree about it. See the file header for why live's order comes
 * first.
 */
export function arrangeHomeDeals(
  rows: readonly HomeDealRow[],
  limit: number = HOME_DEALS_COUNT,
): HomeDeal[] {
  const withPicture = rows.filter((row) => hasThumbnail(row.images))
  const bySlug = new Map(withPicture.map((row) => [row.slug, row]))
  const rest = withPicture
    .filter((row) => !LIVE_ORDER.has(row.slug))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Walk live's slots in order. A slot keeps live's product when the catalogue
  // has it, otherwise the next fill-in takes that slot, so nothing that matches
  // ever moves. A slot with neither is skipped, not left blank.
  const arranged: HomeDealRow[] = []
  for (const slug of LIVE_ORDER.keys()) {
    const row = bySlug.get(slug) ?? rest.shift()
    if (row) arranged.push(row)
  }
  return [...arranged, ...rest].slice(0, limit).map(toHomeDeal)
}

/** The capture, in the card's shape. No city: the capture never had one. */
export const FIXTURE_DEALS: readonly HomeDeal[] = KE_LIVE_DEALS.map((deal) => ({
  id: deal.id,
  slug: deal.slug,
  name_he: deal.name_he,
  kenyon_price: deal.kenyon_price,
  full_price: deal.full_price ?? null,
  images: deal.images,
  stock_quantity: deal.stock_quantity,
  category: deal.category ?? null,
  city: null,
}))

async function readHomeDealRows(): Promise<HomeDealRow[]> {
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
    'homepage.deals_read_failed',
  )
  return (data ?? []) as unknown as HomeDealRow[]
}

/**
 * The cards for the home page grid: the catalogue when it answers, the
 * capture when it does not. An EMPTY catalogue also falls back: a home page
 * with no products is not a configured state, it is a read that returned
 * nothing, and the capture is the last grid this page is known to have shown.
 */
export async function homeDeals(): Promise<readonly HomeDeal[]> {
  try {
    const deals = arrangeHomeDeals(await readHomeDealRows())
    if (deals.length > 0) return deals
    log.warn('homepage.deals_empty', { fallback: 'fixture' })
    return FIXTURE_DEALS
  } catch (error) {
    log.warn('homepage.deals_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return FIXTURE_DEALS
  }
}
