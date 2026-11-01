/**
 * The guest wishlist, in `localStorage`, and nowhere else.
 *
 * WHY NOT A COOKIE, when the guest CART is a cookie. The cart's guest id has
 * to reach the server on every request: `getCart` resolves prices, stock and
 * coupons server-side and the checkout re-reads them. A wishlist id list is
 * never needed to render a public page -- the heart's filled/empty state is
 * per-session data on a cached shell, so it is painted after hydration either
 * way. Putting it in a cookie would add up to 100 uuids to every request in
 * the site, including static assets, and buy nothing.
 *
 * THE LIST IS CAPPED AT 100 AND THE CAP REJECTS RATHER THAN EVICTS.
 * `docs/ARCHITECTURE-WISHLIST.md` non-negotiable 5 states the preference and
 * the reason holds: a wishlist is a list the customer curated, so silently
 * dropping their oldest save to make room for a new one loses data they chose
 * to keep, and they never see it happen. A refusal is visible and reversible.
 *
 * EVERY READER TOLERATES GARBAGE. `localStorage` is writable by any script on
 * the origin and survives across deploys, so a value from an older shape, a
 * half-written string or a quota-exceeded write all have to degrade to "empty
 * wishlist" rather than throw inside a render.
 */

export const WISHLIST_STORAGE_KEY = 'ke_wishlist'
export const WISHLIST_MAX_ITEMS = 100

/** Fired on `window` after any write, so open tabs and the header agree. */
export const WISHLIST_CHANGED_EVENT = 'ke:wishlist-changed'

export type GuestWishlist = {
  v: 1
  /** Product uuids, newest FIRST. The page renders in this order. */
  productIds: string[]
  updatedAt: string
}

/**
 * The same shape the server actions validate. Anything that is not a uuid was
 * not written by this module, and forwarding it to the merge action would only
 * earn a refusal one layer later.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function emptyGuestWishlist(): GuestWishlist {
  return { v: 1, productIds: [], updatedAt: new Date(0).toISOString() }
}

/** Deduplicated, uuid-only, newest first, capped. The one normalisation. */
export function normalizeProductIds(input: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of input) {
    if (typeof value !== 'string' || !UUID.test(value)) continue
    const id = value.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length === WISHLIST_MAX_ITEMS) break
  }
  return out
}

export function parseGuestWishlist(raw: string | null): GuestWishlist {
  if (!raw) return emptyGuestWishlist()
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return emptyGuestWishlist()
    const record = data as Partial<GuestWishlist>
    if (record.v !== 1 || !Array.isArray(record.productIds)) return emptyGuestWishlist()
    return {
      v: 1,
      productIds: normalizeProductIds(record.productIds),
      updatedAt:
        typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    return emptyGuestWishlist()
  }
}

export function readGuestWishlist(): GuestWishlist {
  if (typeof window === 'undefined') return emptyGuestWishlist()
  try {
    return parseGuestWishlist(window.localStorage.getItem(WISHLIST_STORAGE_KEY))
  } catch {
    // Safari in private mode and a blocked-storage setting both throw on read.
    return emptyGuestWishlist()
  }
}

/**
 * Writes and announces. Returns what was actually stored, which is not always
 * what was asked for: the cap and the uuid filter both apply here so that no
 * caller can put a list into storage that a reader would then reject.
 */
export function writeGuestWishlist(productIds: readonly string[]): GuestWishlist {
  const next: GuestWishlist = {
    v: 1,
    productIds: normalizeProductIds(productIds),
    updatedAt: new Date().toISOString(),
  }
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Over quota, or storage disabled. The in-memory state the provider holds
    // is still correct for this tab; only persistence is lost, and losing it
    // silently is better than a render that throws.
  }
  announce(next)
  return next
}

export function clearGuestWishlist(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(WISHLIST_STORAGE_KEY)
  } catch {
    // Same as writeGuestWishlist: nothing to do about it, nothing to throw at.
  }
  announce(emptyGuestWishlist())
}

function announce(detail: GuestWishlist): void {
  window.dispatchEvent(new CustomEvent<GuestWishlist>(WISHLIST_CHANGED_EVENT, { detail }))
}

/** True when the id is already saved. Case-insensitive, like the storage. */
export function guestHas(list: GuestWishlist, productId: string): boolean {
  return list.productIds.includes(productId.toLowerCase())
}

export type GuestToggleResult = {
  list: GuestWishlist
  saved: boolean
  /** Set when nothing changed because the list is full. */
  refusedFull?: true
}

/**
 * Pure: takes a list, returns the next one. The provider owns when to persist,
 * which is what makes this testable without a DOM.
 */
export function guestToggle(list: GuestWishlist, productId: string): GuestToggleResult {
  const id = productId.toLowerCase()
  if (!UUID.test(id)) return { list, saved: guestHas(list, id) }

  if (list.productIds.includes(id)) {
    return {
      list: {
        v: 1,
        productIds: list.productIds.filter((x) => x !== id),
        updatedAt: list.updatedAt,
      },
      saved: false,
    }
  }
  if (list.productIds.length >= WISHLIST_MAX_ITEMS) {
    return { list, saved: false, refusedFull: true }
  }
  return {
    list: { v: 1, productIds: [id, ...list.productIds], updatedAt: list.updatedAt },
    saved: true,
  }
}
