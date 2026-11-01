import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * public/sw.js, EXECUTED.
 *
 * manifest.test.ts pins the worker's safety rails by reading its source, which
 * catches a deleted bypass but not a wrong one: a strategy can be present in
 * the text and still serve a checkout from cache because of a mis-ordered
 * branch. This file loads the worker into a fake ServiceWorkerGlobalScope
 * with an in-memory CacheStorage and a scripted network, dispatches real
 * install/activate/fetch/push events at it, and asserts on what came back.
 *
 * The fakes are deliberately small. `Response` is replaced too, because Node's
 * own reports `type: 'default'` for anything constructed locally and the
 * worker (correctly) refuses to cache anything but `'basic'`.
 */

const ORIGIN = 'https://kenyonexpress.co.il'
const source = readFileSync('public/sw.js', 'utf8')

type Init = { status?: number; type?: string; headers?: Record<string, string> }

class FakeResponse {
  readonly status: number
  readonly type: string
  readonly headers: Map<string, string>
  constructor(
    readonly body: string,
    init: Init = {},
  ) {
    this.status = init.status ?? 200
    this.type = init.type ?? 'basic'
    this.headers = new Map(Object.entries(init.headers ?? {}))
  }
  get ok() {
    return this.status >= 200 && this.status < 300
  }
  clone() {
    return new FakeResponse(this.body, {
      status: this.status,
      type: this.type,
      headers: Object.fromEntries(this.headers),
    })
  }
  async text() {
    return this.body
  }
}

type FakeRequest = { method: string; url: string; headers: Headers; mode: string }

function req(
  path: string,
  opts: { method?: string; mode?: string; origin?: string; range?: boolean } = {},
): FakeRequest {
  const headers = new Headers()
  if (opts.range) headers.set('range', 'bytes=0-100')
  return {
    method: opts.method ?? 'GET',
    url: new URL(path, opts.origin ?? ORIGIN).href,
    headers,
    mode: opts.mode ?? 'no-cors',
  }
}

const keyOf = (r: FakeRequest | string) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url)

class FakeCache {
  readonly store = new Map<string, FakeResponse>()
  async add(url: string) {
    const r = (await network(req(url))) as FakeResponse
    if (!r.ok) throw new TypeError('bad-precache-response')
    this.store.set(keyOf(url), r)
  }
  async put(r: FakeRequest, res: FakeResponse) {
    this.store.set(keyOf(r), res)
  }
  async match(r: FakeRequest | string) {
    return this.store.get(keyOf(r))?.clone()
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }))
  }
  async delete(r: FakeRequest | { url: string } | string) {
    return this.store.delete(typeof r === 'string' ? keyOf(r) : r.url)
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>()
  async open(name: string) {
    let c = this.caches.get(name)
    if (!c) {
      c = new FakeCache()
      this.caches.set(name, c)
    }
    return c
  }
  async keys() {
    return [...this.caches.keys()]
  }
  async delete(name: string) {
    return this.caches.delete(name)
  }
  async match(r: FakeRequest | string) {
    for (const c of this.caches.values()) {
      const hit = await c.match(r)
      if (hit) return hit
    }
    return undefined
  }
  /** Every stored URL across every cache, for "was it cached at all" assertions. */
  urls() {
    return [...this.caches.values()].flatMap((c) => [...c.store.keys()])
  }
}

type Handler = (event: unknown) => void

let handlers: Record<string, Handler[]>
let caches: FakeCacheStorage
let network: (r: FakeRequest) => Promise<FakeResponse> | FakeResponse
let fetchSpy: ReturnType<typeof vi.fn>
let self: {
  addEventListener: (type: string, fn: Handler) => void
  skipWaiting: ReturnType<typeof vi.fn>
  clients: {
    claim: ReturnType<typeof vi.fn>
    matchAll: ReturnType<typeof vi.fn>
    openWindow: ReturnType<typeof vi.fn>
  }
  location: { origin: string }
  registration: { showNotification: ReturnType<typeof vi.fn> }
}

function boot() {
  handlers = {}
  caches = new FakeCacheStorage()
  network = () => new FakeResponse('ok')
  // async, so a scripted failure is a rejection and never a synchronous throw:
  // real fetch never throws before returning its promise.
  fetchSpy = vi.fn(async (r: FakeRequest) => network(r))
  self = {
    addEventListener: (type, fn) => {
      handlers[type] = [...(handlers[type] ?? []), fn]
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: {
      claim: vi.fn(() => Promise.resolve()),
      matchAll: vi.fn(() => Promise.resolve([])),
      openWindow: vi.fn(() => Promise.resolve()),
    },
    location: { origin: ORIGIN },
    registration: { showNotification: vi.fn(() => Promise.resolve()) },
  }
  // The worker's free identifiers, bound as parameters so nothing leaks to
  // the real globals and nothing real leaks in.
  new Function('self', 'caches', 'fetch', 'Response', 'URL', source)(
    self,
    caches,
    fetchSpy,
    FakeResponse,
    URL,
  )
}

/** Runs every handler for a lifecycle event and waits for what it kept alive. */
async function lifecycle(type: 'install' | 'activate') {
  const pending: Promise<unknown>[] = []
  for (const h of handlers[type] ?? []) h({ waitUntil: (p: Promise<unknown>) => pending.push(p) })
  await Promise.all(pending)
}

/** Returns the worker's response, or `undefined` when it let the browser handle the request. */
async function navigate(request: FakeRequest): Promise<FakeResponse | undefined> {
  let responded: Promise<FakeResponse> | undefined
  const pending: Promise<unknown>[] = []
  for (const h of handlers.fetch ?? []) {
    h({
      request,
      respondWith: (p: Promise<FakeResponse> | FakeResponse) => {
        responded = Promise.resolve(p)
      },
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    })
  }
  const out = await responded
  // Fire-and-forget cache writes settle on the microtask queue; drain it so
  // "was it cached" assertions see the final state.
  await new Promise((r) => setTimeout(r, 0))
  return out
}

const nav = (path: string, opts: Parameters<typeof req>[1] = {}) =>
  navigate(req(path, { mode: 'navigate', ...opts }))

const VERSION = /const VERSION = '([^']+)'/.exec(source)?.[1] ?? ''

beforeEach(boot)

describe('install and activate', () => {
  it('precaches the offline shell and takes over immediately', async () => {
    await lifecycle('install')
    expect(caches.urls()).toContain(`${ORIGIN}/offline`)
    expect(self.skipWaiting).toHaveBeenCalled()
  })

  it('still installs when one precache entry is missing', async () => {
    // A 404 on an icon must not leave the origin with no worker at all.
    network = (r) => new FakeResponse('', { status: r.url.endsWith('.png') ? 404 : 200 })
    await expect(lifecycle('install')).resolves.toBeUndefined()
    expect(caches.urls()).toContain(`${ORIGIN}/offline`)
    expect(self.skipWaiting).toHaveBeenCalled()
  })

  it('deletes every cache from a previous version and claims the clients', async () => {
    await caches.open('ke-v1-static')
    await caches.open('ke-v2-pages')
    await caches.open(`${VERSION}-static`)
    await lifecycle('activate')
    expect(await caches.keys()).toEqual([`${VERSION}-static`])
    expect(self.clients.claim).toHaveBeenCalled()
  })
})

describe('bypass: requests the worker must not touch', () => {
  it.each([
    ['a POST', req('/products', { method: 'POST' })],
    ['a cross-origin GET', req('/rest/v1/orders', { origin: 'https://xyz.supabase.co' })],
    ['a Range request', req('/images/clip.mp4', { range: true })],
    ['/api/**', req('/api/cart')],
    ['/checkout', req('/checkout', { mode: 'navigate' })],
    ['/cart', req('/cart', { mode: 'navigate' })],
    ['/account/**', req('/account/orders', { mode: 'navigate' })],
    ['/admin/**', req('/admin/products', { mode: 'navigate' })],
    ['/supplier/**', req('/supplier/scan', { mode: 'navigate' })],
  ])('hands %s straight back to the browser', async (_label, request) => {
    expect(await navigate(request)).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(caches.urls()).toEqual([])
  })
})

describe('immutable assets: cache-first', () => {
  it('fetches once, then serves from cache with no network call', async () => {
    network = () => new FakeResponse('chunk-bytes')
    const first = await navigate(req('/_next/static/chunks/app.js'))
    expect(await first?.text()).toBe('chunk-bytes')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    network = () => {
      throw new Error('offline')
    }
    const second = await navigate(req('/_next/static/chunks/app.js'))
    expect(await second?.text()).toBe('chunk-bytes')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not store a non-200 or an opaque response', async () => {
    network = () => new FakeResponse('nope', { status: 404 })
    await navigate(req('/_next/static/chunks/missing.js'))
    network = () => new FakeResponse('', { type: 'opaque' })
    await navigate(req('/icons/icon-192.png'))
    expect(caches.urls()).toEqual([])
  })
})

describe('images: cache-first, bounded', () => {
  it('serves the optimizer URL from cache on the second request, query string and all', async () => {
    const url = '/_next/image?url=%2Fimages%2Fp.webp&w=640&q=75'
    network = () => new FakeResponse('webp-bytes')
    await navigate(req(url))
    network = () => {
      throw new Error('offline')
    }
    const hit = await navigate(req(url))
    expect(await hit?.text()).toBe('webp-bytes')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('treats a different width as a different picture', async () => {
    network = (r) => new FakeResponse(new URL(r.url).searchParams.get('w') ?? '')
    await navigate(req('/_next/image?url=%2Fa.webp&w=640'))
    const wide = await navigate(req('/_next/image?url=%2Fa.webp&w=1200'))
    expect(await wide?.text()).toBe('1200')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('evicts the oldest picture past the limit', async () => {
    const limit = Number(/const IMAGES_LIMIT = (\d+)/.exec(source)?.[1])
    expect(limit).toBeGreaterThan(0)
    for (let i = 0; i < limit + 1; i++) await navigate(req(`/images/p${i}.webp`))
    const urls = caches.urls()
    expect(urls).toHaveLength(limit)
    expect(urls).not.toContain(`${ORIGIN}/images/p0.webp`)
    expect(urls).toContain(`${ORIGIN}/images/p${limit}.webp`)
  })
})

describe('navigations: network-first, cache only as a fallback', () => {
  it('serves the network while it works, even when a copy is cached', async () => {
    network = () => new FakeResponse('v1')
    await nav('/product/spa-day')
    network = () => new FakeResponse('v2')
    const fresh = await nav('/product/spa-day')
    expect(await fresh?.text()).toBe('v2')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('falls back to the last-seen copy of a browse page when the network fails', async () => {
    network = () => new FakeResponse('catalogue')
    await nav('/category/spa')
    network = () => {
      throw new TypeError('Failed to fetch')
    }
    const offline = await nav('/category/spa')
    expect(await offline?.text()).toBe('catalogue')
  })

  it('falls back to the offline shell for a page never seen', async () => {
    await lifecycle('install')
    network = () => {
      throw new TypeError('Failed to fetch')
    }
    const offline = await nav('/product/never-visited')
    expect(offline?.status).toBe(200)
    // The precached shell, not a network response.
    expect(await offline?.text()).toBe('ok')
  })

  it('answers 503 in Hebrew when there is nothing cached at all', async () => {
    network = () => {
      throw new TypeError('Failed to fetch')
    }
    const last = await nav('/product/x')
    expect(last?.status).toBe(503)
    expect(await last?.text()).toBe('אין חיבור לאינטרנט')
  })

  it('caches the home page and bare catalogue URLs, and nothing else', async () => {
    for (const path of ['/', '/products', '/product/a', '/category/b', '/about', '/blog/post']) {
      await nav(path)
    }
    const pages = [...(await caches.open(`${VERSION}-pages`)).store.keys()]
    expect(pages.sort()).toEqual(
      [`${ORIGIN}/`, `${ORIGIN}/products`, `${ORIGIN}/product/a`, `${ORIGIN}/category/b`].sort(),
    )
  })

  it('never stores a filtered or searched listing', async () => {
    await nav('/products?sort=price')
    await nav('/category/spa?page=2')
    expect(caches.urls()).toEqual([])
  })

  it('never stores an error page', async () => {
    network = () => new FakeResponse('not found', { status: 404 })
    await nav('/product/gone')
    expect(caches.urls()).toEqual([])
  })

  it('evicts the oldest browse page past the limit', async () => {
    const limit = Number(/const PAGES_LIMIT = (\d+)/.exec(source)?.[1])
    for (let i = 0; i < limit + 1; i++) await nav(`/product/p${i}`)
    const pages = [...(await caches.open(`${VERSION}-pages`)).store.keys()]
    expect(pages).toHaveLength(limit)
    expect(pages).not.toContain(`${ORIGIN}/product/p0`)
  })
})

describe('push', () => {
  const push = (data: unknown) => {
    const pending: Promise<unknown>[] = []
    for (const h of handlers.push ?? []) {
      h({
        data: data === null ? null : { json: () => data },
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      })
    }
    return Promise.all(pending)
  }

  it('shows nothing for an empty push or one without a title', async () => {
    await push(null)
    await push({ body: 'no title' })
    await push({ title: '' })
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  it('shows a Hebrew RTL notification whose click target is confined to this origin', async () => {
    await push({ title: 'הקופון מוכן', body: 'לחצו לצפייה', url: '//evil.example/x' })
    await push({ title: 'הזמנה יצאה', url: 'https://evil.example/' })
    await push({ title: 'קאשבק', url: '/account/wallet', tag: 'cashback' })
    const calls = self.registration.showNotification.mock.calls as [
      string,
      Record<string, unknown>,
    ][]
    expect(calls.map(([, o]) => (o.data as { url: string }).url)).toEqual([
      '/',
      '/',
      '/account/wallet',
    ])
    expect(calls[0]?.[1]).toMatchObject({ dir: 'rtl', lang: 'he', body: 'לחצו לצפייה' })
    expect(calls[2]?.[1]).toMatchObject({ tag: 'cashback' })
  })

  it('opens the target on click when no window has it', async () => {
    const pending: Promise<unknown>[] = []
    for (const h of handlers.notificationclick ?? []) {
      h({
        notification: { close: vi.fn(), data: { url: '/account/wallet' } },
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      })
    }
    await Promise.all(pending)
    expect(self.clients.openWindow).toHaveBeenCalledWith('/account/wallet')
  })
})
