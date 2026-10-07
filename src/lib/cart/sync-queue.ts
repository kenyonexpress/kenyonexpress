/**
 * The cart's offline write queue, and the page side of its replay.
 *
 * WHAT IT IS FOR. A shopper on the installed app presses "add" in a tunnel.
 * The server action rejects with a network error, and before this the store
 * rolled the badge back and showed "הפעולה נכשלה, נסו שוב": the item was
 * gone and the only recovery was to find it again later. Now the intent is
 * kept here, the optimistic view stays, and it is replayed when the network
 * returns: by the service worker through the Background Sync API where the
 * browser has it (Chrome, Edge, Samsung on Android), and by the page itself
 * on the `online` event everywhere else (Safari on iOS has no Background
 * Sync and never will; the page fallback is the iOS path, not an afterthought).
 *
 * WHAT IS QUEUED: ABSOLUTE QUANTITIES, NEVER DELTAS. An "add 2" replayed twice
 * is four. A "the line should hold 3" replayed twice is three. Every entry
 * is the quantity the shopper wants the line to end up at (0 for a removal),
 * keyed by line, latest write wins, so the queue holds at most one entry per
 * line and a retry after a lost response is harmless. The server route
 * (`/api/cart/sync`) decides per line whether that is an add, an update or a
 * removal against the cart it actually holds.
 *
 * WHAT IS NOT QUEUED. Coupons, shipping, "remove unavailable" and "clear":
 * all of them need the server to say something back before they mean
 * anything, and none of them is what a shopper does on a train. Only line
 * quantities.
 *
 * WHY INDEXEDDB. The service worker has no `localStorage`; IndexedDB is the
 * one store both sides can read. The schema is deliberately the smallest
 * possible (one object store, `key` as keyPath, no index), and the same names
 * are hard-coded in `public/sw.js`, which cannot import this file. A test
 * pins the two copies together.
 *
 * THE RULE THIS LIVES INSIDE OF. `docs/ARCHITECTURE-CART-CHECKOUT.md` §2.1:
 * browser-side cart state is never trusted for price or checkout. A queued
 * line carries no price, the server re-prices and re-validates stock on
 * replay exactly as it does for a live add, and while anything is queued
 * every checkout button refuses (`queuedLines` in the store), because the
 * cart on screen and the cart the server holds are not the same cart yet.
 */

import type { CartView } from '@/lib/cart/types'

export const CART_SYNC_DB = 'ke-cart-sync'
export const CART_SYNC_STORE = 'lines'
export const CART_SYNC_TAG = 'ke-cart-sync'
export const CART_SYNC_ENDPOINT = '/api/cart/sync'
/** `postMessage` types the worker sends to every open page after a replay. */
export const CART_SYNCED_MESSAGE = 'ke:cart-synced'
export const CART_SYNC_FAILED_MESSAGE = 'ke:cart-sync-failed'

/** The most lines one replay sends. Mirrors the route's schema ceiling. */
export const CART_SYNC_MAX_LINES = 50

export type QueuedCartLine = {
  /** `${product_id}|${variant_id ?? ''}`, the object store's keyPath. */
  key: string
  product_id: string
  variant_id: string | null
  /** The quantity the line should END at. 0 removes it. */
  quantity: number
  /** `Date.now()` of the write, so a replay never clears a newer entry. */
  at: number
}

export type CartSyncRejected = { product_id: string; variant_id: string | null; error: string }

export type CartSyncResult = { ok: true; cart: CartView; rejected: CartSyncRejected[] }

export function cartLineKey(productId: string, variantId: string | null): string {
  return `${productId}|${variantId ?? ''}`
}

/**
 * Whether a thrown server action was the NETWORK failing, as opposed to the
 * server answering with a failure. Only the former is worth queueing: a
 * server that said "no" will say it again, and replaying a validation error
 * for a week is a queue that never drains.
 *
 * `fetch` rejects with a TypeError and nothing else when it cannot reach the
 * origin, and Next's action transport surfaces that rejection as-is. The
 * `onLine` check is the belt to that brace: `false` is reliable ("definitely
 * no network"), `true` is not, so it widens the answer and never narrows it.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return error instanceof TypeError
}

function idb(): IDBFactory | null {
  try {
    if (typeof indexedDB === 'undefined') return null
    return indexedDB
  } catch {
    // Firefox in a sandboxed frame throws on the getter itself.
    return null
  }
}

function openDb(): Promise<IDBDatabase | null> {
  const factory = idb()
  if (!factory) return Promise.resolve(null)
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(CART_SYNC_DB, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CART_SYNC_STORE)) {
        db.createObjectStore(CART_SYNC_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    // Private mode on some engines, quota, a version downgrade: in every
    // case the answer is "no queue", which is the pre-existing behaviour.
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb'))
  })
}

/** Records the quantity a line should end at. Latest write per line wins. */
export async function queueCartLine(
  productId: string,
  variantId: string | null,
  quantity: number,
  now: number = Date.now(),
): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction(CART_SYNC_STORE, 'readwrite')
    const entry: QueuedCartLine = {
      key: cartLineKey(productId, variantId),
      product_id: productId,
      variant_id: variantId,
      quantity,
      at: now,
    }
    await awaitRequest(tx.objectStore(CART_SYNC_STORE).put(entry))
    return true
  } catch {
    return false
  } finally {
    db.close()
  }
}

export async function readCartSyncQueue(): Promise<QueuedCartLine[]> {
  const db = await openDb()
  if (!db) return []
  try {
    const tx = db.transaction(CART_SYNC_STORE, 'readonly')
    const rows = await awaitRequest(tx.objectStore(CART_SYNC_STORE).getAll())
    return (rows as QueuedCartLine[]).sort((a, b) => a.at - b.at)
  } catch {
    return []
  } finally {
    db.close()
  }
}

/**
 * Removes the entries a replay has just sent, and ONLY those: an entry is
 * deleted when the stored `at` is no newer than the one that was sent. A
 * shopper who changed the same line again while the request was in flight
 * keeps the newer write for the next replay.
 */
export async function clearCartSyncQueue(sent: QueuedCartLine[]): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(CART_SYNC_STORE, 'readwrite')
    const store = tx.objectStore(CART_SYNC_STORE)
    for (const line of sent) {
      const current = (await awaitRequest(store.get(line.key))) as QueuedCartLine | undefined
      if (current && current.at <= line.at) await awaitRequest(store.delete(line.key))
    }
  } catch {
    // Left for the next replay. Absolute quantities make that safe.
  } finally {
    db.close()
  }
}

/** Drops everything. For a replay the server refused outright (a 4xx). */
export async function dropCartSyncQueue(): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(CART_SYNC_STORE, 'readwrite')
    await awaitRequest(tx.objectStore(CART_SYNC_STORE).clear())
  } catch {
    // Same as above.
  } finally {
    db.close()
  }
}

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> }
}

/**
 * Asks the browser to replay the queue when it next has a network, through
 * the worker. Resolves to whether the browser took the job: `false` means the
 * page has to do it itself on `online` (`flushCartSyncQueue`), which is every
 * WebKit browser and Firefox.
 */
export async function requestBackgroundCartSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration
    if (!registration.sync) return false
    await registration.sync.register(CART_SYNC_TAG)
    return true
  } catch {
    // Permission denied (a disabled background-sync site setting), or no
    // registration at all (development, private mode). Page fallback.
    return false
  }
}

export type FlushOutcome =
  | { kind: 'empty' }
  | { kind: 'synced'; result: CartSyncResult }
  | { kind: 'retry' }
  | { kind: 'refused'; status: number }

/**
 * The page-side replay. Reads the queue, posts it, clears what was sent on a
 * 2xx, drops it on a 4xx (the server will not take it later either), and
 * leaves it for the next `online` on a 5xx or a network error.
 *
 * `fetchImpl` is a parameter so the test can script the network; the default
 * is the real one.
 */
export async function flushCartSyncQueue(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<FlushOutcome> {
  const lines = await readCartSyncQueue()
  if (lines.length === 0) return { kind: 'empty' }
  const sent = lines.slice(0, CART_SYNC_MAX_LINES)

  let response: Response
  try {
    response = await fetchImpl(CART_SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ lines: sent.map(({ key: _key, at: _at, ...rest }) => rest) }),
    })
  } catch {
    return { kind: 'retry' }
  }

  if (response.ok) {
    let result: CartSyncResult
    try {
      result = (await response.json()) as CartSyncResult
    } catch {
      return { kind: 'retry' }
    }
    await clearCartSyncQueue(sent)
    return { kind: 'synced', result }
  }

  if (response.status >= 500) return { kind: 'retry' }
  // 401, 403, 400, 429: a replay the server has rejected on its merits (or
  // its budget). 429 is the one case where keeping the queue would be right,
  // and it is dropped anyway: a cart sync that lands on a limiter is a cart
  // the shopper has been using live for an hour, so the queue is stale.
  await dropCartSyncQueue()
  return { kind: 'refused', status: response.status }
}
