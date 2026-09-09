import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE SERVICE WORKER HAD NO TEST, AND IT IS THE FILE WITH THE LONGEST REACH.
 *
 * A worker persists per origin and outlives the deploy that installed it. Every
 * routing decision in `public/sw.js` is therefore a decision that can keep being
 * made after the code that made it is gone, and the failures are not subtle:
 *
 *   a cached POST                is a lost order
 *   a cached /api/cart           is somebody else's basket on a shared device
 *   a cached /checkout document  is a stale total on the screen where it counts
 *   a cached navigation          pins a broken build with no way out
 *
 * None of that was covered by anything. `install-prompt.test.tsx` tests the
 * banner, `manifest.test.ts` tests the manifest, and the 230 lines that decide
 * what the browser is actually served were tested by reading them.
 *
 * WHY THIS EVALUATES THE SHIPPED FILE RATHER THAN A COPY. The alternative is
 * extracting `shouldBypass` and friends into a module the worker imports, which
 * a classic worker registered with `/sw.js` cannot do without a build step. So
 * the file is read from disk and run against a fake ServiceWorkerGlobalScope:
 * what is tested is the bytes that are served, and a change to the real file
 * that breaks a rule fails here rather than in a shopper's browser.
 *
 * WHAT THIS CANNOT DO. It does not prove the browser installs it, that
 * `skipWaiting` behaves, or that a real Cache Storage evicts the way the fake
 * one does. Those need a browser and belong in an E2E run. This proves the
 * decisions.
 */

const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

const ORIGIN = 'https://kenyonexpress.co.il'

type Listener = (event: FakeEvent) => void

interface FakeEvent {
  request?: Request
  respondWith: (value: Promise<Response> | Response) => void
  waitUntil: (value: Promise<unknown>) => void
}

/**
 * The key a real Cache Storage would use.
 *
 * A string request is RESOLVED AGAINST THE WORKER'S SCOPE, which is why the
 * worker can store `/offline` and match it back. A fake that keyed on the raw
 * string would pass a test the browser fails, and vice versa: the offline
 * fallback looks up `OFFLINE_URL` as a bare path against entries the fetch
 * handler wrote as absolute URLs.
 */
function cacheKey(request: Request | string): string {
  return typeof request === 'string' ? new URL(request, ORIGIN).href : request.url
}

/** A Cache Storage stand-in that keeps insertion order, which eviction needs. */
class FakeCache {
  readonly entries = new Map<string, Response>()

  async match(request: Request | string): Promise<Response | undefined> {
    return this.entries.get(cacheKey(request))
  }

  async put(request: Request | string, response: Response): Promise<void> {
    // Real Cache Storage replaces in place; Map does too, and keeps the
    // original insertion position, which is the behaviour eviction relies on.
    this.entries.set(cacheKey(request), response)
  }

  async delete(request: Request | string): Promise<boolean> {
    return this.entries.delete(cacheKey(request))
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url))
  }

  async add(url: string): Promise<void> {
    this.entries.set(cacheKey(url), new Response('', { status: 200 }))
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>()

  async open(name: string): Promise<FakeCache> {
    const existing = this.caches.get(name)
    if (existing) return existing
    const created = new FakeCache()
    this.caches.set(name, created)
    return created
  }

  async match(request: Request): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request)
      if (hit) return hit
    }
    return undefined
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()]
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }
}

interface Harness {
  fetchHandler: Listener
  listeners: Map<string, Listener>
  cacheStorage: FakeCacheStorage
  fetchMock: ReturnType<typeof vi.fn>
  showNotification: ReturnType<typeof vi.fn>
  openWindow: ReturnType<typeof vi.fn>
  waited: Promise<unknown>[]
}

/**
 * Evaluates public/sw.js against a fake global scope and returns the handlers
 * it registered. `new Function` and not `eval`: the worker runs in its own
 * scope with `self` passed in, so nothing in it can reach this file's bindings.
 */
function loadWorker(): Harness {
  const listeners = new Map<string, Listener>()
  const cacheStorage = new FakeCacheStorage()
  const waited: Promise<unknown>[] = []

  const fetchMock = vi.fn(async (request: Request) => {
    const url = typeof request === 'string' ? request : request.url
    return withType(new Response(`network:${url}`, { status: 200 }), 'basic')
  })

  const showNotification = vi.fn()
  const openWindow = vi.fn(async () => {})

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [], openWindow },
    location: new URL(`${ORIGIN}/sw.js`),
    registration: { showNotification },
  }

  const run = new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', SW_SOURCE)
  run(self, cacheStorage, fetchMock, Response, Request, URL)

  const fetchHandler = listeners.get('fetch')
  if (!fetchHandler) throw new Error('public/sw.js registered no fetch handler')

  return { fetchHandler, listeners, cacheStorage, fetchMock, showNotification, openWindow, waited }
}

/**
 * `response.type` is read-only on a real Response and the worker checks it, so
 * a stand-in has to carry one. Everything the worker refuses to cache is
 * refused on this field.
 */
function withType(response: Response, type: string): Response {
  Object.defineProperty(response, 'type', { value: type, configurable: true })
  return response
}

/**
 * Runs one request through the worker's fetch handler.
 *
 * `handled` is the load-bearing part: a worker that does NOT call respondWith
 * hands the request back to the browser untouched, which is what every bypass
 * rule in the file means. Asserting on the response alone cannot tell the
 * difference between "bypassed" and "served from the network by the worker".
 */
async function route(
  harness: Harness,
  input: string,
  init: RequestInit & { mode?: string } = {},
): Promise<{ handled: boolean; response: Response | null }> {
  // `mode` is deliberately kept OUT of the constructor: the Request constructor
  // rejects `navigate` outright (only the browser may create one), so the only
  // way to exercise the navigation branch is to define it afterwards.
  const { mode, ...rest } = init
  const request = new Request(input, rest as RequestInit)
  if (mode) Object.defineProperty(request, 'mode', { value: mode, configurable: true })

  let responded: Promise<Response> | Response | null = null
  const event: FakeEvent = {
    request,
    respondWith: (value) => {
      responded = value
    },
    waitUntil: (value) => {
      harness.waited.push(Promise.resolve(value).catch(() => null))
    },
  }

  harness.fetchHandler(event)
  if (responded === null) return { handled: false, response: null }
  return { handled: true, response: await responded }
}

/** Lets the background revalidation settle before the cache is inspected. */
async function settle(harness: Harness): Promise<void> {
  await Promise.all(harness.waited)
}

let harness: Harness

beforeEach(() => {
  harness = loadWorker()
})

describe('what the worker refuses to touch', () => {
  it('never handles a request that is not GET', async () => {
    // The one that costs an order. A POST to /cart or a checkout submission
    // answered from a cache is a purchase that silently did not happen.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { handled } = await route(harness, `${ORIGIN}/products`, { method })
      expect(handled, `${method} was handled`).toBe(false)
    }
  })

  it.each([
    '/api/cart',
    '/api/checkout/session',
    '/checkout',
    '/checkout/payment',
    '/cart',
    '/account/orders',
    '/supplier/dashboard',
    '/admin/reports',
    '/scan',
  ])('never handles %s', async (path) => {
    const { handled } = await route(harness, `${ORIGIN}${path}`, { mode: 'navigate' })
    expect(handled).toBe(false)
  })

  it('never handles another origin', async () => {
    // Supabase and Cardcom. Caching a payment provider's asset is both useless
    // and the kind of thing a CSP audit has to explain later.
    const { handled } = await route(harness, 'https://ixvwfbuvfxxsjiywhbbb.supabase.co/x.png')
    expect(handled).toBe(false)
  })

  it('never handles a ranged request', async () => {
    // Media seeking sends Range and expects a 206. Answering with a whole body
    // from cache breaks the seek.
    const { handled } = await route(harness, `${ORIGIN}/images/clip.mp4`, {
      headers: { range: 'bytes=0-99' },
    })
    expect(handled).toBe(false)
  })
})

describe('immutable assets', () => {
  it('serves a build chunk from cache without going to the network twice', async () => {
    const url = `${ORIGIN}/_next/static/chunks/main-abc123.js`

    const first = await route(harness, url)
    expect(first.handled).toBe(true)
    expect(harness.fetchMock).toHaveBeenCalledTimes(1)

    const second = await route(harness, url)
    expect(await second.response?.text()).toBe(`network:${url}`)
    // Cache-first: the second read must not reach the network at all.
    expect(harness.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a response that is not a clean same-origin 200', async () => {
    harness.fetchMock.mockResolvedValueOnce(withType(new Response('', { status: 500 }), 'basic'))
    const url = `${ORIGIN}/_next/static/chunks/broken.js`

    await route(harness, url)
    await route(harness, url)
    // A cached 500 is a chunk that stays broken until the version is bumped.
    expect(harness.fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('images, stale-while-revalidate', () => {
  const image = `${ORIGIN}/_next/image?url=%2Fp.jpg&w=640&q=75`

  it('serves the cached copy and refreshes it behind the response', async () => {
    const first = await route(harness, image)
    expect(await first.response?.text()).toBe(`network:${image}`)
    await settle(harness)

    harness.fetchMock.mockResolvedValueOnce(
      withType(new Response('fresher', { status: 200 }), 'basic'),
    )
    const second = await route(harness, image)

    // The STALE copy is what the shopper gets, immediately...
    expect(await second.response?.text()).toBe(`network:${image}`)
    // ...and the refresh really happened rather than being dropped on the way
    // out, which is the difference between SWR and a cache-first cache.
    expect(harness.fetchMock).toHaveBeenCalledTimes(2)
    await settle(harness)

    const third = await route(harness, image)
    expect(await third.response?.text()).toBe('fresher')
  })

  it('keeps the query string in the key, because it is the image', async () => {
    // ?w=640 and ?w=1080 are two different pictures of one product. Keying on
    // the path would serve a phone-width image into a desktop grid.
    await route(harness, `${ORIGIN}/_next/image?url=%2Fp.jpg&w=640&q=75`)
    await route(harness, `${ORIGIN}/_next/image?url=%2Fp.jpg&w=1080&q=75`)
    await settle(harness)

    const cache = await harness.cacheStorage.open('ke-v3-images')
    expect(cache.entries.size).toBe(2)
  })

  it('evicts the oldest once the cache is full, and keeps the newest', async () => {
    for (let i = 0; i < 65; i += 1) {
      await route(harness, `${ORIGIN}/_next/image?url=%2Fp${i}.jpg&w=640&q=75`)
    }
    await settle(harness)

    const cache = await harness.cacheStorage.open('ke-v3-images')
    expect(cache.entries.size).toBe(60)
    expect([...cache.entries.keys()].some((url) => url.includes('p0.jpg'))).toBe(false)
    expect([...cache.entries.keys()].some((url) => url.includes('p64.jpg'))).toBe(true)
  })

  it('fails the image rather than serving something else when nothing is cached', async () => {
    harness.fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const { response } = await route(harness, `${ORIGIN}/images/never-seen.png`)
    // Response.error() is what the browser would have produced on its own. A
    // 200 carrying an error body would be decoded as a corrupt image.
    expect(response?.ok).toBe(false)
  })

  it('does not let a failed refresh reject out of the handler', async () => {
    const url = `${ORIGIN}/images/hero.png`
    await route(harness, url)
    await settle(harness)

    harness.fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const { response } = await route(harness, url)
    expect(await response?.text()).toBe(`network:${url}`)
    // An unhandled rejection here kills the worker for the whole page.
    await expect(settle(harness)).resolves.toBeUndefined()
  })
})

describe('navigations', () => {
  it('goes to the network first even for a page it has cached', async () => {
    const url = `${ORIGIN}/product/some-product`

    await route(harness, url, { mode: 'navigate' })
    harness.fetchMock.mockResolvedValueOnce(
      withType(new Response('newer', { status: 200 }), 'basic'),
    )
    const second = await route(harness, url, { mode: 'navigate' })

    // Network-first is the escape hatch from a bad deploy. A document served
    // from cache while the network works is a visitor with no way out.
    expect(await second.response?.text()).toBe('newer')
  })

  it('falls back to the same page it saw before when the network is gone', async () => {
    const url = `${ORIGIN}/category/spa`
    await route(harness, url, { mode: 'navigate' })

    harness.fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const offline = await route(harness, url, { mode: 'navigate' })
    expect(await offline.response?.text()).toBe(`network:${url}`)
  })

  it('falls back to the offline shell for a page it has never seen', async () => {
    const cache = await harness.cacheStorage.open('ke-v3-static')
    await cache.put(new Request(`${ORIGIN}/offline`), new Response('offline shell'))

    harness.fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const { response } = await route(harness, `${ORIGIN}/product/never-visited`, {
      mode: 'navigate',
    })
    expect(await response?.text()).toBe('offline shell')
  })

  it('answers in Hebrew when even the shell is missing', async () => {
    harness.fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const { response } = await route(harness, `${ORIGIN}/`, { mode: 'navigate' })
    expect(response?.status).toBe(503)
    expect(await response?.text()).toContain('אין חיבור')
  })

  it('does not cache a filtered or searched page', async () => {
    // Unbounded cardinality: every sort and price filter is a distinct URL and
    // none of them is a page anybody revisits offline.
    await route(harness, `${ORIGIN}/products?sort=price&min=50`, { mode: 'navigate' })
    const cache = await harness.cacheStorage.open('ke-v3-pages')
    expect(cache.entries.size).toBe(0)
  })

  it('does not cache a page outside the catalogue', async () => {
    await route(harness, `${ORIGIN}/terms`, { mode: 'navigate' })
    const cache = await harness.cacheStorage.open('ke-v3-pages')
    expect(cache.entries.size).toBe(0)
  })
})

/**
 * Moved here from `manifest.test.ts`, where these were assertions that the
 * SOURCE contained certain substrings. A grep cannot tell whether the guard it
 * matched is reachable; running the handler can.
 */
describe('push', () => {
  function push(harness: Harness, data: unknown) {
    const handler = harness.listeners.get('push')
    if (!handler) throw new Error('public/sw.js registered no push handler')
    handler({
      // `event.data.json()` throws on a malformed payload, exactly as the real
      // PushMessageData does.
      data:
        data === undefined
          ? undefined
          : {
              json: () => {
                if (typeof data === 'string') return JSON.parse(data)
                return data
              },
            },
      respondWith: () => {},
      waitUntil: (value: Promise<unknown>) => harness.waited.push(Promise.resolve(value)),
    } as unknown as FakeEvent)
  }

  it('shows nothing for a push with no payload at all', () => {
    // An empty "KenyonExpress" notification teaches people to revoke the
    // permission, and the permission is not given back.
    push(harness, undefined)
    expect(harness.showNotification).not.toHaveBeenCalled()
  })

  it('shows nothing for a payload that is not JSON', () => {
    push(harness, 'not json{')
    expect(harness.showNotification).not.toHaveBeenCalled()
  })

  it('shows nothing for a payload with no title', () => {
    push(harness, { body: 'גוף ההודעה' })
    expect(harness.showNotification).not.toHaveBeenCalled()
  })

  it('renders a titled payload right to left', () => {
    push(harness, { title: 'הקופון פג בקרוב', body: 'נותרו 3 ימים', tag: 'voucher:1' })
    expect(harness.showNotification).toHaveBeenCalledWith(
      'הקופון פג בקרוב',
      expect.objectContaining({ body: 'נותרו 3 ימים', dir: 'rtl', lang: 'he', tag: 'voucher:1' }),
    )
  })

  it('refuses to carry a click target off this origin', () => {
    // `//evil.example` parses as protocol-relative, so startsWith('/') alone is
    // not the check. A compromised push channel must not be able to steer an
    // installed app to another origin.
    for (const url of ['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)']) {
      harness.showNotification.mockClear()
      push(harness, { title: 'כותרת', url })
      expect(harness.showNotification.mock.calls[0]?.[1]?.data).toEqual({ url: '/' })
    }
  })

  it('keeps a same-origin path', () => {
    push(harness, { title: 'כותרת', url: '/account/orders' })
    expect(harness.showNotification.mock.calls[0]?.[1]?.data).toEqual({ url: '/account/orders' })
  })
})

describe('the offline shell the worker names', () => {
  // `OFFLINE_URL` in public/sw.js is a plain string with no compile-time link
  // to the route that answers it. Nothing fails loudly if they part company:
  // `install` adds the precache entries with `allSettled`, so a 404 there is
  // swallowed by design (one bad entry must not leave the origin with no worker
  // at all), and the navigation fallback then degrades to the bare Hebrew
  // Response further down. The site keeps working, the offline experience
  // quietly stops being the page somebody wrote, and no test, log or build step
  // says so.
  const offlineUrl = SW_SOURCE.match(/const OFFLINE_URL = '([^']+)'/)?.[1]

  it('is precached, or it cannot be there when the network is not', () => {
    expect(offlineUrl).toBe('/offline')
    const precache = SW_SOURCE.match(/const PRECACHE = \[([^\]]*)\]/)?.[1]
    expect(precache).toContain('OFFLINE_URL')
  })

  it('is a route that exists in this repository', () => {
    expect(readFileSync(resolve(process.cwd(), `src/app${offlineUrl}/page.tsx`), 'utf8')).toContain(
      'export default function OfflinePage',
    )
  })

  it('is not offered to search engines', () => {
    // A 200 at a guessable address whose whole content is an error message.
    // Nothing links to it, which is not the same as it staying out of an index.
    const source = readFileSync(resolve(process.cwd(), `src/app${offlineUrl}/page.tsx`), 'utf8')
    expect(source).toContain('robots: { index: false, follow: true }')
  })

  it('is not on a path the worker refuses to handle', () => {
    // The bypass list is matched by prefix. An offline shell that fell under
    // one would be fetched from the network at the exact moment there is none.
    const bypass = SW_SOURCE.match(/const BYPASS_PREFIXES = \[([^\]]*)\]/)?.[1] ?? ''
    const prefixes = [...bypass.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
    expect(prefixes.length).toBeGreaterThan(0)
    expect(prefixes.some((prefix) => (offlineUrl ?? '').startsWith(prefix))).toBe(false)
  })
})

describe('the version', () => {
  it('names every cache, so activate can drop the whole previous generation', () => {
    // The kill switch. The activate handler deletes every cache whose name does
    // not start with VERSION, so a cache created under a name that omits it
    // would survive a bump forever.
    const version = SW_SOURCE.match(/const VERSION = '([^']+)'/)?.[1]
    expect(version).toBeTruthy()
    for (const match of SW_SOURCE.matchAll(/const (\w+_CACHE) = ([^\n]+)/g)) {
      expect(match[2], `${match[1]} is not derived from VERSION`).toContain('${VERSION}')
    }
  })
})
