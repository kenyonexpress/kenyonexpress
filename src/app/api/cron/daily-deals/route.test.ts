import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The daily deal scrape: closed to strangers, three steps in a fixed order,
 * and honest when a flash deal fails to apply. The rules live in
 * lib/pricing; what this pins is the route's contract around them.
 */

const { applyDueScheduledPriceChanges, snapshotPrices, revalidateTag, from } = vi.hoisted(() => ({
  applyDueScheduledPriceChanges: vi.fn(),
  snapshotPrices: vi.fn(),
  revalidateTag: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/pricing/flash-deals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pricing/flash-deals')>()),
  applyDueScheduledPriceChanges,
}))
vi.mock('@/lib/pricing/price-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pricing/price-snapshot')>()),
  snapshotPrices,
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/daily-deals', {
    headers: auth ? { authorization: auth } : {},
  })
}

const PRODUCTS = [
  {
    id: 'deal',
    slug: 'deal',
    name_he: 'דיל',
    status: 'active',
    stock_quantity: null,
    kenyon_price_agorot: 5000,
    full_price_agorot: 10000,
  },
  {
    id: 'plain',
    slug: 'plain',
    name_he: 'רגיל',
    status: 'active',
    stock_quantity: null,
    kenyon_price_agorot: 5000,
    full_price_agorot: null,
  },
]

function productsRead(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {}
  const p = Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  for (const m of ['select', 'is', 'limit']) c[m] = () => c
  // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable like the real one
  c.then = p.then.bind(p)
  return c
}

describe('daily-deals cron', () => {
  beforeEach(() => {
    applyDueScheduledPriceChanges
      .mockReset()
      .mockResolvedValue({ due: 0, applied: 0, failed: 0, productIds: [] })
    snapshotPrices.mockReset().mockResolvedValue({ written: 2, alreadyObserved: 0, unpriced: 0 })
    revalidateTag.mockReset()
    from.mockReset().mockReturnValue(productsRead({ data: PRODUCTS }))
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential before touching anything', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(applyDueScheduledPriceChanges).not.toHaveBeenCalled()
      expect(from).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      // This job writes prices. An unconfigured deploy must not be an open one.
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
    })
  })

  it('applies flash deals BEFORE observing, so the observation is the price the day opens with', async () => {
    const order: string[] = []
    applyDueScheduledPriceChanges.mockImplementation(async () => {
      order.push('apply')
      return { due: 0, applied: 0, failed: 0, productIds: [] }
    })
    snapshotPrices.mockImplementation(async () => {
      order.push('snapshot')
      return { written: 0, alreadyObserved: 2, unpriced: 0 }
    })
    await GET(request('Bearer s3cret'))
    expect(order).toEqual(['apply', 'snapshot'])
  })

  it('reports the day, the flash deals, the snapshot and the ranked set', async () => {
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body.ok).toBe(true)
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.flashDeals).toEqual({ due: 0, applied: 0, failed: 0 })
    expect(body.snapshot).toEqual({ written: 2, alreadyObserved: 0, unpriced: 0 })
    expect(body.deals.count).toBe(1)
    expect(body.deals.items[0]).toMatchObject({ id: 'deal', discountBp: 5000 })
  })

  it('invalidates the catalogue cache only when a price actually moved', async () => {
    await GET(request('Bearer s3cret'))
    expect(revalidateTag).not.toHaveBeenCalled()

    applyDueScheduledPriceChanges.mockResolvedValue({
      due: 1,
      applied: 1,
      failed: 0,
      productIds: ['deal'],
    })
    await GET(request('Bearer s3cret'))
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('catalogue', 'max')
  })

  it('answers ok:false with 200 when a flash deal failed, because the rest of the run stands', async () => {
    applyDueScheduledPriceChanges.mockResolvedValue({
      due: 2,
      applied: 1,
      failed: 1,
      productIds: ['deal'],
    })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect((await response.json()).ok).toBe(false)
  })

  it('answers 500 when the schedule cannot be read, so the run is retried', async () => {
    applyDueScheduledPriceChanges.mockRejectedValue(new Error('relation does not exist'))
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'relation does not exist' })
    expect(snapshotPrices).not.toHaveBeenCalled()
  })

  it('answers 500 when the catalogue cannot be read', async () => {
    from.mockReturnValue(productsRead({ error: { message: 'boom' } }))
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(snapshotPrices).not.toHaveBeenCalled()
  })
})
