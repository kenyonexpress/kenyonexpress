import { del, get, set } from '@/lib/cache/redis'

/**
 * Redis-backed session store for the cart row.
 *
 * WHAT A "SESSION" IS HERE. This storefront has no server-side session object
 * of its own: Supabase holds the auth session in a cookie, and a shopper's
 * only per-visit state is the cart row in `public.carts`, keyed either by the
 * account (`profile_id`) or by the `ke_session_id` guest cookie
 * (`session_id`). Every storefront page fetches `/api/cart` after hydration,
 * so that row is read once per page view by every visitor, guest or not, and
 * `pg_stat_user_tables` shows it: `carts` is the most-read row-per-request
 * table the storefront has. This module puts that read behind Upstash so a
 * page view costs one Redis GET instead of one Postgres round trip through
 * PostgREST and RLS.
 *
 * READ-THROUGH FOR READS, WRITE-THROUGH FOR WRITES, AND NEVER IN BETWEEN.
 * Only the display read (`getCart`) goes through the cache. Every mutation
 * still reads the row from Postgres first, because a mutation uses the row's
 * `id` to decide between UPDATE and INSERT and a stale id there is a second
 * cart. After a successful write the saved row is put back, so the next page
 * view sees it without waiting for a TTL. The merge at login forgets both
 * scopes, because one of them stops existing.
 *
 * WHAT STALENESS CAN COST. The row holds product ids and quantities only;
 * prices, stock and availability are resolved fresh from the catalogue on
 * every read (`resolveCartView`). So a stale row can show a line the shopper
 * removed from another tab within the TTL, and nothing worse. The only writer
 * outside this module is the `reap-carts` cron, which deletes rows whose
 * `expires_at` (30 days after the last write) has passed; a cached copy of a
 * row that has just been reaped is served for at most one TTL and then the
 * next read misses. That is a fifteen-minute echo of a month-old cart.
 *
 * FAILURE POLICY. Same as `lib/cache/redis`: unconfigured or unreachable
 * Redis means every read is a miss and every write-back is dropped, and the
 * caller cannot tell. The `source` field in the result exists so a log line
 * or a test can.
 *
 * `null` IS CACHED. A guest with no cart yet is the common case on a first
 * visit and it is exactly the read worth saving. It is stored as an envelope
 * (`{ row: null }`) rather than as the value `null`, because `redis.get`
 * returns `null` for a miss and the two must not look alike.
 */

export type CartScope = { kind: 'user' | 'guest'; id: string }

/**
 * Fifteen minutes. Long enough to cover a browsing session across a dozen
 * page views, short enough that the reaper echo described above is bounded.
 */
export const CART_SESSION_TTL_SECONDS = 15 * 60

const KEY_PREFIX = 'sess:cart:v1'

export function cartSessionKey(scope: CartScope): string {
  return `${KEY_PREFIX}:${scope.kind}:${scope.id}`
}

type Envelope<T> = { row: T | null }

export type CartRowSource = 'cache' | 'origin'

/**
 * The cached row when there is one, otherwise `load()`'s answer, stored for
 * next time. A loader that throws is not cached and the throw propagates.
 */
export async function readCartRowThrough<T>(
  scope: CartScope,
  load: () => Promise<T | null>,
): Promise<{ row: T | null; source: CartRowSource }> {
  const key = cartSessionKey(scope)
  const hit = await get<Envelope<T>>(key)
  if (hit && typeof hit === 'object' && 'row' in hit) {
    return { row: hit.row, source: 'cache' }
  }
  const row = await load()
  await set<Envelope<T>>(key, { row }, CART_SESSION_TTL_SECONDS)
  return { row, source: 'origin' }
}

/** Write-through after a successful save. */
export async function rememberCartRow<T>(scope: CartScope, row: T | null): Promise<void> {
  await set<Envelope<T>>(cartSessionKey(scope), { row }, CART_SESSION_TTL_SECONDS)
}

/** Drop the entry, e.g. when the row moved to another scope at login. */
export async function forgetCartRow(scope: CartScope): Promise<void> {
  await del(cartSessionKey(scope))
}
