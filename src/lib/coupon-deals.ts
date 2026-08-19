import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The public read of one coupon deal, CACHED and on the anon client.
 *
 * It exists because `/coupons/[id]` could not answer a truthful `404`. Its
 * lookup had to sit inside a `<Suspense>` - `cacheComponents` fails the build
 * outright on an uncached read outside one - and a boundary means the status
 * line is already on the wire when `notFound()` runs. So every uuid on earth
 * got `200 OK` with a not-found body. Caching the read is what lets the page
 * await it before it answers.
 *
 * `createPublicClient()` rather than the cookie-bound `createClient()`, for the
 * same two reasons as `category-page.ts`: a cached scope cannot touch request
 * APIs, and a catalogue row must not depend on who is asking. The page it backs
 * shows the same deal to everybody.
 *
 * `cacheLife` and `cacheTag` are written here rather than behind a helper,
 * deliberately - see the note in `category-page.ts`. They are directives about
 * the scope they appear in, and a helper makes it possible to add a `use cache`
 * function that silently has neither.
 *
 * THE TAG IS NOT DECORATION. `admin/coupon-deals.ts` now calls
 * `updateTag(CATALOGUE_TAG)` on save and on archive; without that an edit is
 * invisible here for an hour and nothing reports it. That contract is written
 * out in full in `catalogue-cache.ts`.
 */
export async function getCouponDeal(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  return orFail(
    await supabase
      .from('coupon_deals')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .single(),
    'coupon_deal.read_failed',
    { deal_id: id },
  )
}

/**
 * The ids of every active deal, prerendered.
 *
 * Not a performance flourish - it is what lets the page await `params` outside
 * a `<Suspense>` at all. Without it `params` is itself uncached request data
 * and `cacheComponents` fails the build on exactly the line that makes the
 * `404` possible. `/category/[slug]` is the same arrangement, for the same
 * reason.
 *
 * Uncapped, like the category list and unlike the product page's 200: this is
 * eight rows of curated deals, not a catalogue that grows with imports. An id
 * that is not in it still renders, at request time, and still 404s when it
 * matches nothing.
 */
export async function getActiveCouponDealIds(): Promise<string[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const data = orFail(
    await supabase.from('coupon_deals').select('id').eq('status', 'active').is('deleted_at', null),
    'coupon_deal.active_ids_failed',
  )
  return (data ?? []).map((row) => row.id)
}
