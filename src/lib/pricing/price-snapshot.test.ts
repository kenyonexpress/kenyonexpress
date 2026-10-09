import { describe, expect, it, vi } from 'vitest'
import { jerusalemDayKey, selectUnobserved, snapshotPrices } from './price-snapshot'

/**
 * The daily observation is what the thirty-day reference-price check reads.
 * Two things must hold: a product is observed once per day per price and not
 * more (or the window fills with duplicates), and a product whose price
 * moved during the day is observed AGAIN (or the lower price the customer
 * was charged never enters the record).
 */

type Row = { product_id: string; price_agorot: number }

function product(id: string, price: number | null, reference: number | null = null) {
  return { id, status: 'active', kenyon_price_agorot: price, full_price_agorot: reference }
}

describe('selectUnobserved', () => {
  it('skips a product already observed today at the same price', () => {
    const existing: Row[] = [{ product_id: 'a', price_agorot: 9900 }]
    const result = selectUnobserved([product('a', 9900), product('b', 5000)], existing)
    expect(result.rows.map((r) => r.id)).toEqual(['b'])
    expect(result.alreadyObserved).toBe(1)
  })

  it('observes a product again when its price moved since this morning', () => {
    const existing: Row[] = [{ product_id: 'a', price_agorot: 15000 }]
    const result = selectUnobserved([product('a', 9900)], existing)
    expect(result.rows.map((r) => r.id)).toEqual(['a'])
    expect(result.alreadyObserved).toBe(0)
  })

  it('cannot observe a product with no sticker price, and counts it', () => {
    const result = selectUnobserved([product('a', null), product('b', 100)], [])
    expect(result.rows.map((r) => r.id)).toEqual(['b'])
    expect(result.unpriced).toBe(1)
  })
})

describe('jerusalemDayKey', () => {
  it('files a UTC evening under the next Israeli day', () => {
    // 22:30 UTC on the 9th is 01:30 on the 10th in Jerusalem (summer, UTC+3).
    expect(jerusalemDayKey(new Date('2026-09-09T22:30:00Z'))).toBe('2026-09-10')
  })
})

/** A supabase-js-shaped stub: every builder method chains, `await` resolves. */
function chain(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const c: Record<string, unknown> = {}
  const p = Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  for (const m of ['select', 'eq', 'is', 'insert', 'order', 'limit']) c[m] = () => c
  // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable like the real one
  c.then = p.then.bind(p)
  return c
}

describe('snapshotPrices', () => {
  it('inserts one row per unobserved product with source=snapshot', async () => {
    const insert = vi.fn(() => chain({}))
    const admin = {
      from: vi.fn((table: string) => {
        if (table !== 'price_history') throw new Error(table)
        const c = chain({ data: [{ product_id: 'a', price_agorot: 9900 }] })
        c.insert = insert
        return c
      }),
    }
    const result = await snapshotPrices(
      admin as never,
      [product('a', 9900, 12000), product('b', 5000, null)],
      '2026-09-17',
      'test',
    )
    expect(result).toEqual({ written: 1, alreadyObserved: 1, unpriced: 0 })
    expect(insert).toHaveBeenCalledExactlyOnceWith([
      {
        product_id: 'b',
        observed_on: '2026-09-17',
        price_agorot: 5000,
        reference_agorot: null,
        status: 'active',
        source: 'snapshot',
      },
    ])
  })

  it('treats a unique-index race (23505) as already written, not as a failure', async () => {
    const admin = {
      from: () => {
        const c = chain({ data: [] })
        c.insert = () => chain({ error: { code: '23505', message: 'duplicate' } })
        return c
      },
    }
    const result = await snapshotPrices(admin as never, [product('a', 1)], '2026-09-17', 'test')
    expect(result.written).toBe(0)
  })

  it('never throws on a failed read; the caller has its own duty to finish', async () => {
    const admin = { from: () => chain({ error: { message: 'relation missing' } }) }
    await expect(
      snapshotPrices(admin as never, [product('a', 1)], '2026-09-17', 'test'),
    ).resolves.toEqual({ written: 0, alreadyObserved: 0, unpriced: 0 })
  })
})
