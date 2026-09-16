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
 *   images            cache-first with a bounded cache (IMAGES_LIMIT entries,
 *                     oldest evicted): /_next/image, /images/** and the logo.
 *                     A browse page served offline without its pictures is a
 *                     grid of alt text, so the pictures the shopper already
 *                     downloaded are kept alongside the page. The optimizer
 *                     URL carries its width and quality, so a hit is the same
 *                     bytes the page asked for. Cache-first here is safe for
 *                     the same reason as the assets above: a product photo
 *                     that changes gets a new URL from the storage layer.
 *   navigations       network-FIRST, with two fallbacks in order, both used
 *                     only when the network actually fails: the last-seen copy
 *                     of the same browse page, then the offline shell. A
 *                     document is never served from cache while the network
 *                     works.
 *   browse pages      home, /products, /product/*, /category/* documents that
 *                     came back 200 are kept in a bounded LRU-ish cache
 *                     (PAGES_LIMIT entries, oldest evicted) so the catalogue a
 *                     shopper already saw survives losing signal. Only bare
 *                     URLs: a query string means a search/filter permutation,
 *                     and caching those is unbounded cardinality for pages
 *                     nobody revisits offline.
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
 * PUSH. A push with no JSON payload, or a payload we cannot parse, shows
 * nothing: an empty "KenyonExpress" notification teaches people to revoke the
 * permission. The click target is confined to a same-origin path; a payload
 * carrying an absolute URL falls back to '/', so a compromised push channel
 * cannot steer an installed app to another origin.
 *
 * The version string is the kill switch. Bump it and every old cache is
 * deleted on activate; combined with skipWaiting + clients.claim, a broken
 * worker can be replaced on the next load rather than on the next tab close.
 */

const VERSION = 'ke-v3'
const STATIC_CACHE = `${VERSION}-static`
const PAGES_CACHE = `${VERSION}-pages`
const IMAGES_CACHE = `${VERSION}-images`
const OFFLINE_URL = '/offline'

// Enough for a browsing session over the catalogue, small enough that the
// eviction sweep in putBounded stays trivial.
const PAGES_LIMIT = 40
// A product grid is 8-12 pictures and a product page 3-5. Two screens of
// catalogue plus the page the shopper is on, and nothing like a photo library.
const IMAGES_LIMIT = 80

// Kept deliberately tiny. Precaching a route list is how a worker ends up
// pinning pages that later change; the offline shell is the only document that
// has to exist before the network fails.
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

const BYPASS_PREFIXES = ['/api/', '/checkout', '/cart', '/account', '/supplier', '/admin', '/scan']

// The catalogue, and only the catalogue. Everything else either changes per
// shopper or is reachable again from one of these once the network is back.
const BROWSE_PREFIXES = ['/product/', '/category/', '/products']

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

/**
 * The optimizer endpoint and the two static picture folders. Query strings
 * are PART of the key here, unlike browse pages: /_next/image?url=..&w=640 and
 * the same at w=1200 are different bytes, and the bounded cache is what keeps
 * that cardinality from mattering.
 */
function isImage(url) {
  return (
    url.pathname === '/_next/image' ||
    url.pathname.startsWith('/images/') ||
    url.pathname === '/logo.png'
  )
}

function shouldBypass(request, url) {
  if (request.method !== 'GET') return true
  if (url.origin !== self.location.origin) return true
  if (request.headers.has('range')) return true
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

/** Bare catalogue URLs only; see the header for why a query string is out. */
function isBrowsePage(url) {
  if (url.search !== '') return false
  if (url.pathname === '/') return true
  return BROWSE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

/** Store, then evict from the front: keys() is insertion-ordered, so the front is the oldest. */
async function putBounded(cacheName, request, response, limit) {
  const cache = await caches.open(cacheName)
  await cache.put(request, response)
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) {
    await cache.delete(key)
  }
}

/** Cache-first with a bounded store. Used for pictures; assets have no bound because they need none. */
async function cacheFirstBounded(cacheName, request, limit) {
  const hit = await caches.match(request)
  if (hit) return hit
  const response = await fetch(request)
  // Same bar as everywhere else: a clean same-origin 200, stored
  // fire-and-forget so the picture is never delayed by its own bookkeeping.
  if (response.ok && response.type === 'basic') {
    putBounded(cacheName, request, response.clone(), limit)
  }
  return response
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

  if (isImage(url)) {
    event.respondWith(cacheFirstBounded(IMAGES_CACHE, request, IMAGES_LIMIT))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Same bar as the asset cache: a clean same-origin 200 and nothing
          // else, stored fire-and-forget so caching never delays the response.
          if (response.ok && response.type === 'basic' && isBrowsePage(url)) {
            putBounded(PAGES_CACHE, request, response.clone(), PAGES_LIMIT)
          }
          return response
        })
        .catch(async () => {
          const pages = await caches.open(PAGES_CACHE)
          const seen = await pages.match(request)
          if (seen) return seen
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

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  if (!payload || typeof payload.title !== 'string' || payload.title === '') return

  // Same-origin path or nothing: see the header.
  const url =
    typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//')
      ? payload.url
      : '/'

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: typeof payload.body === 'string' ? payload.body : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      // A stable tag collapses re-sends of the same event into one
      // notification instead of a stack.
      tag: typeof payload.tag === 'string' && payload.tag !== '' ? payload.tag : undefined,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname === url && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
