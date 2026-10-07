import { revalidatePath, revalidateTag } from 'next/cache'
import { MAX_CACHE_TAG_LENGTH } from './tags'

/**
 * The route-handler half of invalidation. Server Actions call
 * `updateTag(CATALOGUE_TAG)` (catalogue-cache.ts): the admin who saved wants
 * to see the save, so the next request blocks for fresh data. A webhook or
 * an on-demand call has no reader waiting on the other end, so it uses
 * `revalidateTag(tag, 'max')`: the entry is marked stale, the next visitor is
 * served the stale copy while it refills, and nobody pays a cold render for
 * a change they did not make. `updateTag` is also not callable from a route
 * handler at all; Next throws.
 *
 * `'max'` and not the one-argument form: without a profile `revalidateTag`
 * behaves like `{ expire: 0 }` (blocking) and is deprecated.
 *
 * Both functions are synchronous in Next and neither returns anything, so
 * the return value here is the list that was actually submitted: the
 * response body echoes it, which is how a Supabase webhook log or a curl
 * tells "did nothing" from "did the wrong thing".
 */
export function revalidateCacheTags(tags: readonly string[]): string[] {
  const submitted: string[] = []
  for (const tag of tags) {
    if (!tag || tag.length > MAX_CACHE_TAG_LENGTH || submitted.includes(tag)) continue
    revalidateTag(tag, 'max')
    submitted.push(tag)
  }
  return submitted
}

/**
 * Storefront paths an on-demand caller may purge. Anchored and closed: the
 * secret buys a purge of the public catalogue, not of `/account/...` or of
 * an arbitrary string Next would happily accept and silently match nothing.
 *
 * Slugs here are what `products.slug` / `categories.slug` hold: lower-case
 * Latin, digits and hyphens. A supplier storefront is keyed by its uuid.
 */
export const REVALIDATABLE_PATH =
  /^\/(?:|products|search|sitemap\.xml|feed\.xml|merchant\.xml|(?:category|product|coupon)\/[a-z0-9][a-z0-9-]{0,199}|s\/[0-9a-f-]{36})$/

export function isRevalidatablePath(path: string): boolean {
  return REVALIDATABLE_PATH.test(path)
}

export function revalidateCachePaths(paths: readonly string[]): string[] {
  const submitted: string[] = []
  for (const path of paths) {
    if (!isRevalidatablePath(path) || submitted.includes(path)) continue
    revalidatePath(path)
    submitted.push(path)
  }
  return submitted
}
