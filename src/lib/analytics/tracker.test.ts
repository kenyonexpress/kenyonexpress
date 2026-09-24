import { ATTRIBUTION_COOKIE } from '@/lib/analytics/attribution'
import { CONSENT_COOKIE } from '@/lib/analytics/consent'
import { MAX_BATCH_SIZE } from '@/lib/analytics/events'
import { FLUSH_INTERVAL_MS } from '@/lib/analytics/queue'
import { SESSION_STORAGE_KEY } from '@/lib/analytics/session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The browser tracker. The contract is the request that leaves for /api/a:
 * nothing without consent, nothing without a stable session, a batch with
 * the envelope fields the ingest schema requires, a retry on 5xx and a drop
 * on 4xx, and a beacon on pagehide.
 */

type Tracker = typeof import('./tracker')

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/`
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

function fetchAnswering(status: number) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
  }))
}

/** A fresh module instance, so the singleton and its listeners start clean. */
async function fresh(): Promise<Tracker> {
  vi.resetModules()
  return import('./tracker')
}

function sentEvents(
  fetchMock: { mock: { calls: unknown[][] } },
  call = 0,
): Record<string, unknown>[] {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit
  return (JSON.parse(String(init.body)) as { events: Record<string, unknown>[] }).events
}

beforeEach(() => {
  setCookie(CONSENT_COOKIE, 'granted.2')
  clearCookie(ATTRIBUTION_COOKIE)
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearCookie(CONSENT_COOKIE)
  clearCookie(ATTRIBUTION_COOKIE)
})

describe('consent', () => {
  it('sends nothing and touches no storage without a granted consent cookie', async () => {
    clearCookie(CONSENT_COOKIE)
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()

    track('page_view')
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(getTracker().shouldSampleWebVitals()).toBe(false)
  })

  it('treats a denied or stale-wording consent as no consent', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()
    for (const raw of ['denied.2', 'granted.1']) {
      setCookie(CONSENT_COOKIE, raw)
      track('page_view')
      getTracker().flush()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('track', () => {
  it('posts a batch to the ingest path with the envelope the schema requires', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    vi.setSystemTime(new Date('2026-09-17T10:00:00.000Z'))
    const { INGEST_PATH, getTracker, track } = await fresh()

    track('view_product', { product_id: 'p1' })
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(INGEST_PATH)
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })

    const session = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}') as {
      id: string
    }
    const [event] = sentEvents(fetchMock)
    expect(event).toMatchObject({
      event_name: 'view_product',
      occurred_at: '2026-09-17T10:00:00.000Z',
      source: 'web',
      source_app: 'shop',
      session_id: session.id,
      path: location.pathname,
      props: { product_id: 'p1' },
    })
    expect(event?.event_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(event).not.toHaveProperty('utm')
  })

  it('drops an event that is missing a required prop', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()
    track('view_product', {})
    track('add_to_cart', { product_id: 'p1' })
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flushes on its own once the batch is full', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { track } = await fresh()
    for (let i = 0; i < MAX_BATCH_SIZE; i += 1) track('page_view')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentEvents(fetchMock)).toHaveLength(MAX_BATCH_SIZE)
  })

  it('flushes on the interval timer', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { track } = await fresh()
    track('page_view')
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a batch once after a 5xx and drops it after a 4xx', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 })
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()

    track('page_view')
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentEvents(fetchMock, 1)[0]?.event_id).toBe(sentEvents(fetchMock, 0)[0]?.event_id)
  })

  it('treats a thrown fetch as a failure worth one retry', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()

    track('page_view')
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up quietly when storage is unavailable', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      track('page_view')
      expect(getTracker().shouldSampleWebVitals()).toBe(false)
      getTracker().flush()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
    }
  })

  it('never lets an analytics failure reach the page', async () => {
    vi.stubGlobal('fetch', fetchAnswering(200))
    const { track } = await fresh()
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no entropy')
    })
    expect(() => track('page_view')).not.toThrow()
  })
})

describe('attribution', () => {
  it('captures UTM from the URL into the first-party cookie and onto events', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const { getTracker, track } = await fresh()

    getTracker().captureAttribution('?utm_source=facebook&utm_campaign=rosh')
    const raw = document.cookie.match(new RegExp(`${ATTRIBUTION_COOKIE}=([^;]*)`))?.[1]
    const stored = JSON.parse(decodeURIComponent(raw ?? '')) as {
      first: Record<string, string>
      last: Record<string, string>
    }
    expect(stored.first.utm_source).toBe('facebook')
    expect(stored.last.utm_campaign).toBe('rosh')

    track('page_view')
    getTracker().flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(sentEvents(fetchMock)[0]?.utm).toEqual({ utm_source: 'facebook', utm_campaign: 'rosh' })
  })

  it('leaves the cookie alone without consent or without a UTM in the URL', async () => {
    const { getTracker } = await fresh()
    getTracker().captureAttribution('?ref=internal')
    expect(document.cookie).not.toContain(ATTRIBUTION_COOKIE)

    clearCookie(CONSENT_COOKIE)
    getTracker().captureAttribution('?utm_source=x')
    expect(document.cookie).not.toContain(ATTRIBUTION_COOKIE)
  })

  it('reads location.search when no query is passed', async () => {
    const { getTracker } = await fresh()
    getTracker().captureAttribution()
    expect(document.cookie).not.toContain(ATTRIBUTION_COOKIE)
  })
})

describe('last-gasp flush', () => {
  it('beacons the pending batch on pagehide', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    const sendBeacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
    const { INGEST_PATH, track } = await fresh()

    track('page_view')
    window.dispatchEvent(new Event('pagehide'))

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob]
    expect(url).toBe(INGEST_PATH)
    expect(blob.type).toBe('application/json')
    expect(fetchMock).not.toHaveBeenCalled()

    // The queue is drained, so a second pagehide sends nothing.
    window.dispatchEvent(new Event('pagehide'))
    expect(sendBeacon).toHaveBeenCalledTimes(1)
  })

  it('falls back to a keepalive POST when the browser has no sendBeacon', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    const { track } = await fresh()

    track('page_view')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentEvents(fetchMock)).toHaveLength(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('ignores a visibilitychange back to visible', async () => {
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    const { track } = await fresh()
    track('page_view')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('shouldSampleWebVitals', () => {
  it('answers the draw made when the session was created', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { getTracker } = await fresh()
    expect(getTracker().shouldSampleWebVitals()).toBe(true)
    expect(getTracker()).toBe(getTracker())
  })
})
