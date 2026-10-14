/**
 * The infinite grid's state that outlives the component: which extra pages a
 * shopper had loaded and how far down they were, so that Back from a product
 * returns them to the card they left and not to the top of page one.
 *
 * Pure functions over plain values. The component owns the storage and the
 * window; everything that can be wrong about a stored blob is decided here,
 * where it is a unit test away.
 */

export type StoredItem = { id: string } & Record<string, unknown>

export type ListingSnapshot = {
  items: StoredItem[]
  nextPage: number
  scrollY: number
  savedAt: number
}

/** A snapshot older than this is a different shopping trip. */
export const SNAPSHOT_TTL_MS = 30 * 60 * 1000

/** Ten pages of 24. Past that the blob outgrows what it is for. */
export const MAX_STORED_ITEMS = 240

/** One key per listing URL and starting page, so two filters never share a snapshot. */
export function snapshotKey(endpoint: string, startPage: number): string {
  return `ke:listing:${startPage}:${endpoint}`
}

/**
 * The endpoint for one listing, without `page`: the scope, the category slug
 * and whichever of the listing's own parameters are set. Keys are sorted so a
 * listing has one spelling, which is also its snapshot key.
 */
export function listingEndpoint(
  scope: 'shop' | 'category',
  params: Readonly<Record<string, string | undefined>>,
  slug?: string,
): string {
  const query = new URLSearchParams({ scope })
  if (slug) query.set('slug', slug)
  for (const key of Object.keys(params).sort()) {
    const value = params[key]
    if (value && key !== 'page') query.set(key, value)
  }
  return `/api/catalogue/listing?${query.toString()}`
}

/** The URL of page `page` of the listing behind `endpoint`. */
export function pageUrl(endpoint: string, page: number): string {
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}`
}

/** `incoming` appended to `current`, without any id already shown. */
export function mergeItems<T extends { id: string }>(
  shown: readonly T[],
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set<string>()
  for (const item of shown) seen.add(item.id)
  for (const item of current) seen.add(item.id)
  const out = [...current]
  for (const item of incoming) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function serializeSnapshot(snapshot: ListingSnapshot): string {
  return JSON.stringify({ ...snapshot, items: snapshot.items.slice(0, MAX_STORED_ITEMS) })
}

/**
 * A stored blob, or null when it is absent, malformed, stale or from the
 * future. Never throws: storage is written by whatever ran on this origin.
 */
export function parseSnapshot(raw: string | null, now: number): ListingSnapshot | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { items, nextPage, scrollY, savedAt } = value as Record<string, unknown>
  if (!Array.isArray(items)) return null
  if (typeof nextPage !== 'number' || !Number.isInteger(nextPage) || nextPage < 2) return null
  if (typeof scrollY !== 'number' || !Number.isFinite(scrollY) || scrollY < 0) return null
  if (typeof savedAt !== 'number' || savedAt > now || now - savedAt > SNAPSHOT_TTL_MS) return null
  const valid = items.filter(
    (item): item is StoredItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { slug?: unknown }).slug === 'string' &&
      typeof (item as { name_he?: unknown }).name_he === 'string',
  )
  if (valid.length !== items.length) return null
  return { items: valid.slice(0, MAX_STORED_ITEMS), nextPage, scrollY, savedAt }
}
