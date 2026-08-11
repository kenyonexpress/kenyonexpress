import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Where each homepage deal card is allowed to point, measured against the real
 * catalogue instead of assumed from the fixture.
 *
 * WHY THIS EXISTS. `KE_LIVE_DEALS` is a verbatim mirror of the old live site's
 * 32-card grid, extracted from `refs/ke_live_singlefile.html`. It carries live's
 * hrefs and live's own mismatched slugs, and nothing ever checked that this
 * catalogue answers them. Measured against production on 2026-08-12, three
 * separate dead ends were in that grid at once:
 *
 *   - 2 slugs have no product row here at all (`reverse-withdrawal-payment`,
 *     a bookkeeping entry, and `קופון-טסט`, a test coupon).
 *   - 6 slugs are `draft` with no supplier and no percents, so the storefront
 *     will not serve them: `צימר-מאסטר-copy-copy`,
 *     `מלון-4-כוכבים-פלוס-ארוחת-בוקר`, `מלון-5-כוכבים-בטבריה`,
 *     `ארוחת-בוקר-זוגית-בקפה-קפה`, `עוזרת-אישית-שירותי-משרד`,
 *     `תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה`. They are a subset of the 19
 *     rows migration 113 is waiting on and cannot be published from here: both
 *     percentages are the admin's to set, per the dynamic-percentages rule.
 *   - 4 cards carry `category: general`, and there is no `general` category.
 *     On `אוזניות-איירפודס-3` the PRODUCT resolves and only the category is
 *     dead, which is why counting product slugs alone missed it.
 *
 * The category half hid behind a status code, and the mechanism is worth
 * keeping. `/product/<dead-slug>` answers a real HTTP 404 - the page is fully
 * static per slug. `/category/general` answers **200** and streams the
 * not-found body: `notFound()` runs inside `CategoryPageBody`, which sits in a
 * Suspense boundary, so the shell is already committed by the time it fires.
 * The visitor lands on "הדף שחיפשתם לא נמצא" either way; only the response
 * line differs. That is exactly why `home.spec.ts` "reaching the footer costs
 * no 404s", which watches response statuses, never reported these four - a
 * dead link that answers 200 is invisible to it.
 *
 * The fixture also carries fixture ids (`ke-deal-9132`), not product uuids, and
 * `addToCartSchema` validates `product_id` as a uuid. So EVERY add-to-cart
 * button in this grid, all 32, failed validation before it ever reached the
 * cart. The same lookup that decides whether a link is safe returns the real
 * uuid, which is what makes those buttons work.
 *
 * WHAT THIS DOES NOT DO: it does not drop cards. The grid is pixel-matched to
 * `refs/` under a project rule, and dropping 8 of 32 cards would take the
 * homepage from 8 rows to 6 and blow the 11% comparison gate. A card whose
 * target is dead keeps its box, its image and its price, and loses only the
 * thing that was broken - the link, and the button that could not work.
 *
 * DEGRADED READS ARE NOT DEAD LINKS. If the query errors (no network at build
 * time, Supabase down), the answer is "unknown", not "unreachable": every card
 * keeps its links and simply gets no cart button, which is exactly how this
 * grid behaved before this file existed. A cache miss must never be able to
 * strip the whole homepage of its links.
 */
export type DealTarget = {
  /** The real product uuid, when the slug resolves to a purchasable product. */
  productId: string | null
  /** Whether `/product/<slug>` renders rather than answering 404. */
  productReachable: boolean
  /** Whether `/category/<slug>` renders rather than answering 404. */
  categoryReachable: boolean
}

export type DealTargets = Record<string, DealTarget>

/** What a card gets when the fixture slug is not in the map at all. */
export const UNKNOWN_DEAL_TARGET: DealTarget = {
  productId: null,
  productReachable: true,
  categoryReachable: true,
}

type DealShape = { slug: string; category?: { slug: string } | null }

/**
 * The decision, separated from the round trip so it can be tested without one.
 *
 * `productIds` / `categories` are `null` when the catalogue could not be read.
 * Null means unknown and resolves to "reachable, not addable"; an EMPTY map
 * means the catalogue answered and holds none of them, which does mean dead.
 */
export function buildDealTargets(
  deals: readonly DealShape[],
  catalogue: {
    productIds: ReadonlyMap<string, string> | null
    categories: ReadonlySet<string> | null
  },
): DealTargets {
  const targets: DealTargets = {}

  for (const deal of deals) {
    const productId = catalogue.productIds?.get(deal.slug) ?? null
    const categorySlug = deal.category?.slug ?? null

    targets[deal.slug] = {
      productId,
      productReachable: catalogue.productIds === null ? true : productId !== null,
      categoryReachable:
        categorySlug === null || catalogue.categories === null
          ? true
          : catalogue.categories.has(categorySlug),
    }
  }

  return targets
}

/** Every distinct category slug the fixture links to. */
export function dealCategorySlugs(deals: readonly DealShape[]): string[] {
  return [...new Set(deals.map((d) => d.category?.slug).filter((s): s is string => Boolean(s)))]
}

export async function loadDealTargets(): Promise<DealTargets> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const slugs = KE_LIVE_DEALS.map((d) => d.slug)

  const [productsRes, categoriesRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, slug')
      .in('slug', slugs)
      .eq('status', 'active')
      .is('deleted_at', null),
    supabase
      .from('categories')
      .select('slug')
      .in('slug', dealCategorySlugs(KE_LIVE_DEALS))
      .eq('is_active', true),
  ])

  // `error` and not `!data`: an empty array is an answer ("none of these are
  // live"), an error is the absence of one, and they must not collapse.
  const productIds = productsRes.error
    ? null
    : new Map((productsRes.data ?? []).map((r) => [r.slug, r.id] as const))
  const categories = categoriesRes.error
    ? null
    : new Set((categoriesRes.data ?? []).map((r) => r.slug))

  return buildDealTargets(KE_LIVE_DEALS, { productIds, categories })
}
