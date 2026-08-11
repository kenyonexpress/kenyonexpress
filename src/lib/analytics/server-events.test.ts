import { describe, expect, it, vi } from 'vitest'
import {
  type ServerAnalyticsConfig,
  fallbackClientId,
  hashIdentifier,
  readServerAnalyticsConfig,
  sendServerPurchase,
} from './server-events'

const FULL: ServerAnalyticsConfig = {
  ga4MeasurementId: 'G-ABC1234567',
  ga4ApiSecret: 'secret',
  metaPixelId: '123456789012',
  metaAccessToken: 'token',
}

const INPUT = {
  orderId: 'order-1',
  items: [{ id: 'p1', name: 'ארוחה', priceAgorot: 5000, quantity: 1 }],
  valueAgorot: 5000,
  email: '  Dana@Example.COM ',
  phone: '+972-50-123-4567',
}

function okFetch() {
  return vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch
}

function bodyOf(fetchImpl: typeof fetch, index: number): Record<string, unknown> {
  const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[index] as [
    string,
    RequestInit,
  ]
  return JSON.parse(String(call[1].body))
}

function urlOf(fetchImpl: typeof fetch, index: number): string {
  return String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[index]?.[0])
}

describe('hashIdentifier', () => {
  it('normalises before hashing, which is part of the contract', () => {
    // A hash of a differently-normalised string never matches, and the failure
    // is silent: the event lands and matches nobody.
    expect(hashIdentifier('  Dana@Example.COM ', 'email')).toBe(
      hashIdentifier('dana@example.com', 'email'),
    )
    expect(hashIdentifier('+972-50-123-4567', 'phone')).toBe(
      hashIdentifier('972501234567', 'phone'),
    )
  })

  it('returns null rather than hashing nothing', () => {
    expect(hashIdentifier(null, 'email')).toBeNull()
    expect(hashIdentifier('', 'email')).toBeNull()
    expect(hashIdentifier('---', 'phone')).toBeNull()
  })

  it('produces a hex sha256, which is the only format Meta accepts', () => {
    expect(hashIdentifier('a@b.test', 'email')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('fallbackClientId', () => {
  it('is stable per order, so a replay is one user and not two', () => {
    // A random id here would make GA4 count two different users for one
    // purchase, which is worse than a synthetic one.
    expect(fallbackClientId('order-1')).toBe(fallbackClientId('order-1'))
    expect(fallbackClientId('order-1')).not.toBe(fallbackClientId('order-2'))
  })

  it('has the two-part shape GA4 expects', () => {
    expect(fallbackClientId('order-1')).toMatch(/^\d+\.\d+$/)
  })
})

describe('readServerAnalyticsConfig', () => {
  it('treats blanks as unset', () => {
    const config = readServerAnalyticsConfig({ GA4_API_SECRET: '  ', META_CAPI_TOKEN: '' })
    expect(config.ga4ApiSecret).toBeNull()
    expect(config.metaAccessToken).toBeNull()
  })
})

describe('sendServerPurchase', () => {
  it('does nothing at all when neither vendor is configured', async () => {
    const fetchImpl = okFetch()
    const result = await sendServerPurchase(INPUT, {
      config: {
        ga4MeasurementId: null,
        ga4ApiSecret: null,
        metaPixelId: null,
        metaAccessToken: null,
      },
      fetchImpl,
    })
    expect(result).toEqual({ sent: false, reason: 'unconfigured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('needs BOTH halves of a vendor pair, not just the public id', async () => {
    // The measurement id is public and will be set long before the api_secret
    // is. Sending without the secret is a request that 401s every time.
    const fetchImpl = okFetch()
    await sendServerPurchase(INPUT, {
      config: { ...FULL, ga4ApiSecret: null, metaAccessToken: null },
      fetchImpl,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends the order id as the deduplication key to both vendors', async () => {
    // The whole risk of server-side reporting: a purchase seen by the browser
    // AND by finalize must be counted once, or reported revenue inflates and an
    // ad budget looks profitable when it is not.
    const fetchImpl = okFetch()
    await sendServerPurchase(INPUT, { config: FULL, fetchImpl })

    const ga = bodyOf(fetchImpl, 0)
    expect((ga.events as { params: { transaction_id: string } }[])[0]?.params.transaction_id).toBe(
      'order-1',
    )

    const meta = bodyOf(fetchImpl, 1)
    expect((meta.data as { event_id: string }[])[0]?.event_id).toBe('order-1')
  })

  it('never sends a raw email or phone', async () => {
    const fetchImpl = okFetch()
    await sendServerPurchase(INPUT, { config: FULL, fetchImpl })
    const raw = JSON.stringify(bodyOf(fetchImpl, 1))
    expect(raw).not.toContain('dana@example.com')
    expect(raw).not.toContain('Dana@Example.COM')
    expect(raw).not.toContain('972501234567')
    expect(raw).toContain(hashIdentifier(INPUT.email, 'email') as string)
  })

  it('keeps the api secret in the query string and the token in the body', async () => {
    const fetchImpl = okFetch()
    await sendServerPurchase(INPUT, { config: FULL, fetchImpl })
    expect(urlOf(fetchImpl, 0)).toContain('api_secret=secret')
    expect(bodyOf(fetchImpl, 1).access_token).toBe('token')
  })

  it('reports partial success when one vendor is down', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).includes('google-analytics')
        ? { ok: true, status: 200 }
        : { ok: false, status: 500 },
    ) as unknown as typeof fetch
    const result = await sendServerPurchase(INPUT, { config: FULL, fetchImpl })
    expect(result).toEqual({ sent: true, vendors: ['ga4'] })
  })

  it('never throws when the network does', async () => {
    // This runs after the card was charged. An analytics call that threw would
    // leave an order incomplete over a marketing metric.
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch
    const result = await sendServerPurchase(INPUT, { config: FULL, fetchImpl })
    expect(result).toEqual({ sent: false, reason: 'no vendor accepted the event' })
  })

  it('uses the browser client id when there is one', async () => {
    const fetchImpl = okFetch()
    await sendServerPurchase({ ...INPUT, clientId: '111.222' }, { config: FULL, fetchImpl })
    expect(bodyOf(fetchImpl, 0).client_id).toBe('111.222')
  })
})
