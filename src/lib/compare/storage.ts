/**
 * The products a shopper has picked to compare, in `localStorage`.
 *
 * Same shape and the same reasons as the guest wishlist
 * (`lib/wishlist/guest-storage.ts`): the list is per browser, nothing here is
 * read on the server, every reader tolerates garbage rather than throwing
 * inside a render, and a custom event tells the other controls on the page
 * that the list changed (`storage` only fires in OTHER tabs).
 *
 * FOUR, AND THE FIFTH IS REFUSED RATHER THAN SWAPPED IN. A comparison is a
 * table with a column per product; four columns is what fits a phone held
 * sideways and a desktop without shrinking the type. Silently dropping the
 * oldest pick to admit a new one would change a table the shopper is in the
 * middle of reading, so the toggle says the list is full instead.
 */

export const COMPARE_STORAGE_KEY = 'ke_compare'
export const COMPARE_MAX_ITEMS = 4
export const COMPARE_CHANGED_EVENT = 'ke:compare-changed'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Stored = { v: 1; productIds: string[] }

/** Deduplicated, uuid-only, in the order they were picked, capped. */
export function normalizeCompareIds(input: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of input) {
    if (typeof value !== 'string' || !UUID.test(value)) continue
    const id = value.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length === COMPARE_MAX_ITEMS) break
  }
  return out
}

export function parseCompareList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return []
    const record = data as Partial<Stored>
    if (record.v !== 1 || !Array.isArray(record.productIds)) return []
    return normalizeCompareIds(record.productIds)
  } catch {
    return []
  }
}

/** In the order picked. Empty on the server and on any storage failure. */
export function readCompareList(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return parseCompareList(window.localStorage.getItem(COMPARE_STORAGE_KEY))
  } catch {
    return []
  }
}

export function writeCompareList(productIds: readonly string[]): string[] {
  const next = normalizeCompareIds(productIds)
  if (typeof window === 'undefined') return next
  try {
    if (next.length === 0) window.localStorage.removeItem(COMPARE_STORAGE_KEY)
    else
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify({ v: 1, productIds: next }))
  } catch {
    // Over quota or storage disabled: the controls on this page still agree
    // with each other through the event below; only persistence is lost.
  }
  window.dispatchEvent(new CustomEvent<string[]>(COMPARE_CHANGED_EVENT, { detail: next }))
  return next
}

export type CompareToggleResult = { list: string[]; selected: boolean; refusedFull?: true }

/** Adds the product, or removes it if it is already picked. Pure. */
export function toggleCompare(list: readonly string[], productId: string): CompareToggleResult {
  const id = productId.toLowerCase()
  const current = normalizeCompareIds(list)
  if (!UUID.test(id)) return { list: current, selected: false }
  if (current.includes(id)) return { list: current.filter((x) => x !== id), selected: false }
  if (current.length >= COMPARE_MAX_ITEMS)
    return { list: current, selected: false, refusedFull: true }
  return { list: [...current, id], selected: true }
}
