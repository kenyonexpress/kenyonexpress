import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The editor's `source = 'change'` observation (STEP 59). Pinned: a change is
 * measured in integer agorot on either price, the row carries today's
 * Jerusalem day and the status, the unique index is success, and a failure is
 * logged and reported but never thrown.
 */

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn(), debug: vi.fn() },
}))

const { priceChanged, recordPriceChange } = await import('./price-change')

const P = '11111111-1111-4111-8111-111111111111'

function admin(result: { error: { code?: string; message: string } | null }) {
  const insert = vi.fn(async (_row: unknown) => result)
  const from = vi.fn(() => ({ insert }))
  return { client: { from } as never, insert, from }
}

beforeEach(() => warn.mockReset())

describe('priceChanged', () => {
  it('compares both prices in agorot, so 100 and "100.00" are the same price', () => {
    expect(
      priceChanged(
        { kenyon_price: 100, full_price: 150 },
        { kenyon_price: '100.00', full_price: '150' },
      ),
    ).toBe(false)
    expect(
      priceChanged(
        { kenyon_price: 100, full_price: null },
        { kenyon_price: 99.99, full_price: null },
      ),
    ).toBe(true)
    expect(
      priceChanged({ kenyon_price: 100, full_price: null }, { kenyon_price: 100, full_price: 150 }),
    ).toBe(true)
    expect(
      priceChanged({ kenyon_price: 100, full_price: 150 }, { kenyon_price: 100, full_price: '' }),
    ).toBe(true)
  })

  it('treats a sub-agora move as no change', () => {
    expect(
      priceChanged(
        { kenyon_price: 100, full_price: null },
        { kenyon_price: 100.001, full_price: null },
      ),
    ).toBe(false)
  })
})

describe('recordPriceChange', () => {
  it('writes the observation for today in Asia/Jerusalem, in agorot, with the status', async () => {
    const { client, insert, from } = admin({ error: null })
    // 23:30 UTC on the 7th is 02:30 on the 8th in Jerusalem (UTC+3 in October).
    const now = new Date('2026-10-07T23:30:00Z')
    await expect(
      recordPriceChange(
        client,
        { productId: P, kenyon_price: 99.9, full_price: '150', status: 'active' },
        now,
      ),
    ).resolves.toBe('written')
    expect(from).toHaveBeenCalledWith('price_history')
    expect(insert).toHaveBeenCalledWith({
      product_id: P,
      observed_on: '2026-10-08',
      price_agorot: 9990,
      reference_agorot: 15000,
      status: 'active',
      source: 'change',
    })
  })

  it('records a null reference and an unknown status as such', async () => {
    const { client, insert } = admin({ error: null })
    await recordPriceChange(client, {
      productId: P,
      kenyon_price: 10,
      full_price: null,
      status: null,
    })
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ reference_agorot: null, status: 'unknown' })
  })

  it('refuses to observe a product with no price, writing nothing', async () => {
    const { client, insert } = admin({ error: null })
    await expect(
      recordPriceChange(client, {
        productId: P,
        kenyon_price: null,
        full_price: null,
        status: 'draft',
      }),
    ).resolves.toBe('unpriced')
    expect(insert).not.toHaveBeenCalled()
  })

  it('treats the unique index as the row already existing', async () => {
    const { client } = admin({ error: { code: '23505', message: 'duplicate' } })
    await expect(
      recordPriceChange(client, {
        productId: P,
        kenyon_price: 10,
        full_price: null,
        status: 'active',
      }),
    ).resolves.toBe('exists')
    expect(warn).not.toHaveBeenCalled()
  })

  it('logs any other failure and never throws', async () => {
    const { client } = admin({ error: { code: '42501', message: 'permission denied' } })
    await expect(
      recordPriceChange(client, {
        productId: P,
        kenyon_price: 10,
        full_price: null,
        status: 'active',
      }),
    ).resolves.toBe('failed')
    expect(warn).toHaveBeenCalledWith('price_history.change_write_failed', {
      productId: P,
      reason: 'permission denied',
    })
  })
})
