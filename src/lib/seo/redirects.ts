import { createClient } from '@supabase/supabase-js'
import { normalizePath } from './normalize-path'

export { normalizePath }

/**
 * The 301/410 map, resolved in the proxy on every request.
 *
 * WHY AN IN-MEMORY MAP AND NOT A QUERY
 *
 * This runs before every request that reaches the app. A database round trip
 * here would be paid by every visitor, on every page, to answer a question that
 * is "no" almost every time. The whole table is a few thousand rows of two
 * short strings, so it fits in memory with room to spare and the hot path costs
 * one Map.get().
 *
 * The cost of that choice is staleness bounded by TTL_MS: a redirect added in
 * the admin takes up to five minutes to be served by an already-warm instance.
 * That is the right trade for a table whose rows are written during a migration
 * and then left alone for years.
 *
 * WHY NOT next.config redirects()
 *
 * Decision 1.45 of MASTER-ARCHITECTURE: `redirects()` emits 308, not 301, and
 * it splits the source of truth between a build artefact and a table. Every
 * redirect lives here.
 */

export type RedirectHit = {
  target: string
  status: 301 | 410
}

const TTL_MS = 5 * 60 * 1000

let cache: Map<string, RedirectHit> | null = null
let loadedAt = 0
let inflight: Promise<Map<string, RedirectHit>> | null = null

/**
 * The ANON key, not the service role, and that is a correction rather than a
 * shortcut.
 *
 * This module arrived reading through createAdminClient(). Two reasons not to:
 * the table's own RLS policy already says `FOR SELECT TO anon USING (is_active)`
 * — where a retired URL now points is not a secret, and the migration's comment
 * says so in as many words — and this code runs in the EDGE runtime, where
 * handing out a key that bypasses every policy on every table buys nothing and
 * widens the blast radius of anything that can read module scope.
 *
 * It also makes the module work where the service key does not. `.env.local`
 * carries the stock `iss=supabase-demo` key, which the hosted project rejects,
 * so through the admin client every lookup threw, failed open, and left the
 * cache null — one dead round trip in front of every single request on the
 * developer's machine. Through anon it loads.
 */
function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
}

async function load(): Promise<Map<string, RedirectHit>> {
  const admin = client()
  const next = new Map<string, RedirectHit>()

  // Paged, because a single select of a large table silently truncates at the
  // PostgREST row cap and the missing rows would look exactly like redirects
  // that were never configured.
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('seo_redirects')
      .select('source_path, target_path, status_code')
      .eq('is_active', true)
      .range(from, from + PAGE - 1)

    if (error) throw error
    for (const row of data ?? []) {
      next.set(row.source_path, {
        target: row.target_path,
        status: row.status_code === 410 ? 410 : 301,
      })
    }
    if (!data || data.length < PAGE) break
  }

  return next
}

async function getMap(): Promise<Map<string, RedirectHit> | null> {
  const fresh = cache && Date.now() - loadedAt < TTL_MS
  if (fresh) return cache

  // One loader at a time. Without this, a cold start under load fires one
  // query per concurrent request.
  if (!inflight) {
    inflight = load()
      .then((m) => {
        cache = m
        loadedAt = Date.now()
        return m
      })
      .finally(() => {
        inflight = null
      })
  }

  try {
    return await inflight
  } catch {
    // Fail OPEN, deliberately, and this is the one place in the codebase where
    // that is right. If the table cannot be read, the choice is between
    // serving the site without redirects (old URLs 404, which is what happens
    // today anyway) and serving no site at all. A redirect lookup must never
    // be able to take down the storefront.
    //
    // A stale map is better than none, so an expired cache is still returned.
    return cache
  }
}

export async function lookupRedirect(pathname: string): Promise<RedirectHit | null> {
  const map = await getMap()
  if (!map) return null
  return map.get(normalizePath(pathname)) ?? null
}

/** Test seam and admin hook: drop the cache so the next lookup re-reads. */
export function invalidateRedirectCache(): void {
  cache = null
  loadedAt = 0
}
