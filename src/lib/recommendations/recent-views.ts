/**
 * The browser's own copy of its recent `view_item` products, for the
 * personalised home row.
 *
 * WHY A LOCAL COPY WHEN POSTHOG HAS THE EVENTS. Two reasons, both measured:
 * no deployment has `POSTHOG_API_KEY` set on 2026-10-08, so the server cannot
 * ask PostHog what this visitor looked at; and PostHog ingests with a lag, so
 * even when it can, the product viewed ten seconds ago is not in the answer.
 * The list is written at the SAME moment and from the SAME component that
 * captures `view_item` (`ViewTracker`), behind the same consent gate, so it is
 * the PostHog history and not a second one.
 *
 * It holds product ids and nothing else: no names, no prices, no times. It is
 * sent to `/api/recommendations/for-you` as `seed`, where it is UUID-filtered
 * and capped again (`sanitizeSeedIds`), because localStorage is writable by
 * anything running on the origin.
 */

export const RECENT_VIEWS_KEY = 'ke_recent_views'

export const RECENT_VIEWS_MAX = 12

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function storage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function readRecentViews(store: StorageLike | null = storage()): string[] {
  if (!store) return []
  try {
    const raw = store.getItem(RECENT_VIEWS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_VIEWS_MAX)
  } catch {
    return []
  }
}

/** Moves `productId` to the front, dropping repeats and the oldest past the cap. */
export function recordRecentView(
  productId: string,
  store: StorageLike | null = storage(),
): string[] {
  if (!store || !productId) return readRecentViews(store)
  const next = [productId, ...readRecentViews(store).filter((id) => id !== productId)].slice(
    0,
    RECENT_VIEWS_MAX,
  )
  try {
    store.setItem(RECENT_VIEWS_KEY, JSON.stringify(next))
  } catch {
    // Quota or private mode: the row is simply thinner.
  }
  return next
}
