/**
 * KenyonExpress service worker.
 *
 * A service worker is the one thing on a site that can outlive a bad deploy: it
 * persists per origin, and a worker that cache-firsts documents will keep
 * serving a broken build to a returning visitor long after the fix is live,
 * with no way for that visitor to escape it. Everything below is shaped by
 * that, so read the exclusions as the feature and the caching as the extra.
 *
 * WHAT IS CACHED
 *   /_next/static/**  cache-first. Content-hashed and immutable by
 *                     construction, so a stale hit is impossible: a changed
 *                     file has a different URL.
 *   /icons/**         cache-first. Same reasoning, changed rarely and by hand.
 *   navigations       network-FIRST, with the offline shell as the fallback
 *                     only when the network actually fails. A document is
 *                     never served from cache while the network works.
 *
 * WHAT IS NEVER TOUCHED, and why each one would be a bug
 *   anything not GET      a cached POST is a lost order
 *   /api/**               includes the cart bootstrap and the money paths;
 *                         all of it is per-shopper and no-store
 *   /checkout /cart       showing a stale cart total is worse than an error
 *   /account /supplier
 *   /admin                per-user and privileged; a cached page here can be
 *                         read by the next person on a shared device
 *   cross-origin          Supabase, Cardcom. Not ours to cache.
 *   requests with a
 *   Range header          media seeking breaks on a whole-body cache hit
 *
 * The version string is the kill switch. Bump it and every old cache is
 * deleted on activate; combined with skipWaiting + clients.claim, a broken
 * worker can be replaced on the next load rather than on the next tab close.
 */

const VERSION = 'ke-v1'
const STATIC_CACHE = `${VERSION}-static`
const OFFLINE_URL = '/offline'

// Kept deliberately tiny. Precaching a route list is how a worker ends up
// pinning pages that later change; the offline shell is the only document that
// has to exist before the network fails.
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

const BYPASS_PREFIXES = ['/api/', '/checkout', '/cart', '/account', '/supplier', '/admin', '/scan']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // Individually, so one 404 in the list cannot fail the whole install and
      // leave the origin with no worker at all.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** A message channel so a future deploy can force an update without a reload. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

function shouldBypass(request, url) {
  if (request.method !== 'GET') return true
  if (url.origin !== self.location.origin) return true
  if (request.headers.has('range')) return true
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Returning without calling respondWith hands the request back to the
  // browser untouched, which is exactly what a bypass should mean.
  if (shouldBypass(request, url)) return

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            // Only store a clean same-origin 200. An opaque or partial response
            // in the cache is indistinguishable from a real one on the way out.
            if (response.ok && response.type === 'basic') {
              const copy = response.clone()
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE)
        const offline = await cache.match(OFFLINE_URL)
        return (
          offline ??
          new Response('אין חיבור לאינטרנט', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        )
      }),
    )
  }
})
