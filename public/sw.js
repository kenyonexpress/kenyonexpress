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
 *   /_next/image      stale-while-revalidate, bounded to IMAGES_LIMIT. The
 *   /images/**        cached copy is served at once and refreshed behind it.
 *                     Right for a photo and wrong for everything else here: a
 *                     stale price is a consumer-protection problem, a stale
 *                     cart is a lost order, and a stale photo of a product is
 *                     the photo of that product. These are cached by FULL URL,
 *                     query string included, because `?w=640` and `?w=1080` are
 *                     two different images -- the opposite of the rule for
 *                     browse pages below, and for the opposite reason.
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
// eviction sweep in putBrowsePage stays trivial.
const PAGES_LIMIT = 40

/**
 * Images are the heaviest thing cached here and the only entries with no upper
 * bound of their own: every product, at every width next/image was asked for,
 * is a distinct URL. 60 is roughly two screens of a category grid at the two
 * widths a phone actually requests, and the eviction below is the same
 * insertion-order trim the pages cache uses.
 */
const IMAGES_LIMIT = 60

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
 * Product imagery, which is neither immutable nor per-shopper.
 *
 * `/_next/image` is the optimizer, and it is where every product photo on the
 * site comes from. Unlike a browse page, THE QUERY STRING IS THE IDENTITY here:
 * `?url=...&w=640&q=75` and `?url=...&w=1080&q=75` are two different images of
 * the same product, so these are cached by full URL rather than by path.
 *
 * `/images/` is the handful of static pictures shipped in public/ -- the hero
 * and the category tiles. They live outside `/_next/static/`, so they are not
 * content-hashed and cannot be cache-firsted like a chunk: replacing one keeps
 * its URL.
 */
function isRevalidatedImage(url) {
  return url.pathname === '/_next/image' || url.pathname.startsWith('/images/')
}

/** Insertion-order trim, shared by the two bounded caches. */
async function trimCache(cache, limit) {
  const keys = await cache.keys()
  // keys() is insertion-ordered, so trimming from the front evicts oldest.
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) {
    await cache.delete(key)
  }
}

/**
 * Stale-while-revalidate, for images only.
 *
 * A cached photo is served IMMEDIATELY and the network copy replaces it in the
 * background for next time. That is the right trade for a picture and the wrong
 * one for anything else on this site: a stale price is a consumer-protection
 * problem and a stale cart is a lost order, but a stale photo of a product is
 * the photo of that product.
 *
 * WHY THE REVALIDATION IS HANDED BACK TO `waitUntil`. The response resolves
 * from the cache, so without it the worker may be killed the moment it returns
 * and the refresh never happens -- an SWR cache that never revalidates is just
 * a cache-first cache with a longer comment.
 *
 * A failed revalidation is swallowed. The visitor already has the image; going
 * offline must not turn a served picture into a rejected promise.
 */
function staleWhileRevalidate(event, request) {
  return caches.open(IMAGES_CACHE).then(async (cache) => {
    const hit = await cache.match(request)

    const revalidate = fetch(request)
      .then(async (response) => {
        // Same bar as everywhere else: an opaque or partial response in the
        // cache is indistinguishable from a real one on the way out.
        if (response.ok && response.type === 'basic') {
          await cache.put(request, response.clone())
          await trimCache(cache, IMAGES_LIMIT)
        }
        return response
      })
      .catch(() => null)

    if (hit) {
      event.waitUntil(revalidate)
      return hit
    }

    const fresh = await revalidate
    // Nothing cached and the network is gone. `Response.error()` is what the
    // browser would have produced without a worker in the way, so the image
    // fails exactly as it would otherwise -- rather than as a 200 carrying an
    // error page, which an <img> renders as a broken icon with no explanation.
    return fresh ?? Response.error()
  })
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

async function putBrowsePage(request, response) {
  const cache = await caches.open(PAGES_CACHE)
  await cache.put(request, response)
  await trimCache(cache, PAGES_LIMIT)
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

  if (isRevalidatedImage(url)) {
    event.respondWith(staleWhileRevalidate(event, request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Same bar as the asset cache: a clean same-origin 200 and nothing
          // else, stored fire-and-forget so caching never delays the response.
          if (response.ok && response.type === 'basic' && isBrowsePage(url)) {
            putBrowsePage(request, response.clone())
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
