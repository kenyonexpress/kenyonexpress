/**
 * The recently-viewed product list, in `localStorage`, and nowhere else.
 *
 * Same shape and the same reasons as the guest wishlist
 * (`lib/wishlist/guest-storage.ts`): a view is per-browser rather than account
 * data worth merging on sign-in, nothing here is read on the server, and every
 * reader tolerates garbage from an older shape, a blocked-storage setting or
 * Safari private mode rather than throwing inside a render.
 */

export const RECENTLY_VIEWED_STORAGE_KEY = 'ke_recently_viewed'
export const RECENTLY_VIEWED_MAX_ITEMS = 12

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RecentlyViewedList = { v: 1; productIds: string[] }

function emptyList(): RecentlyViewedList {
  return { v: 1, productIds: [] }
}

/** Deduplicated, uuid-only, newest first, capped. The one normalisation. */
function normalizeIds(input: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of input) {
    if (typeof value !== 'string' || !UUID.test(value)) continue
    const id = value.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length === RECENTLY_VIEWED_MAX_ITEMS) break
  }
  return out
}

function parse(raw: string | null): RecentlyViewedList {
  if (!raw) return emptyList()
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return emptyList()
    const record = data as Partial<RecentlyViewedList>
    if (record.v !== 1 || !Array.isArray(record.productIds)) return emptyList()
    return { v: 1, productIds: normalizeIds(record.productIds) }
  } catch {
    return emptyList()
  }
}

/** Newest first. Empty on the server and on any storage failure. */
export function readRecentlyViewed(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return parse(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY)).productIds
  } catch {
    // Safari in private mode and a blocked-storage setting both throw on read.
    return []
  }
}

/** Moves `productId` to the front, deduplicated and capped. A no-op on the server. */
export function recordRecentlyViewed(productId: string): void {
  if (typeof window === 'undefined') return
  if (!UUID.test(productId)) return
  try {
    const current = parse(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY))
    const next: RecentlyViewedList = {
      v: 1,
      productIds: normalizeIds([productId, ...current.productIds]),
    }
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Over quota, or storage disabled. The rail simply renders empty next time;
    // losing persistence silently is better than a product page that throws.
  }
}
