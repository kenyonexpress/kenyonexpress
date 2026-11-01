import { describe, expect, it, vi } from 'vitest'
import { type DealCandidate, applyDueScheduledPriceChanges, rankDeals } from './flash-deals'

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function candidate(overrides: Partial<DealCandidate> & { id: string }): DealCandidate {
  return {
    slug: overrides.id,
    name_he: overrides.id,
    status: 'active',
    stock_quantity: null,
    kenyon_price_agorot: 9900,
    full_price_agorot: 15000,
    ...overrides,
  }
}

describe('rankDeals', () => {
  it('ranks by discount, deepest first, with an integer half-up basis-point figure', () => {
    const deals = rankDeals([
      candidate({ id: 'quarter', kenyon_price_agorot: 7500, full_price_agorot: 10000 }),
      candidate({ id: 'half', kenyon_price_agorot: 5000, full_price_agorot: 10000 }),
      candidate({ id: 'third', kenyon_price_agorot: 6667, full_price_agorot: 10000 }),
    ])
    expect(deals.map((d) => [d.id, d.discountBp])).toEqual([
      ['half', 5000],
      ['third', 3333],
      ['quarter', 2500],
    ])
  })

  it('is not a deal without a reference strictly above the sticker', () => {
    const deals = rankDeals([
      candidate({ id: 'equal', kenyon_price_agorot: 100, full_price_agorot: 100 }),
      candidate({ id: 'inverted', kenyon_price_agorot: 200, full_price_agorot: 100 }),
      candidate({ id: 'noref', kenyon_price_agorot: 100, full_price_agorot: null }),
      candidate({ id: 'noprice', kenyon_price_agorot: null, full_price_agorot: 100 }),
    ])
    expect(deals).toEqual([])
  })

  it('leaves out what cannot be bought: inactive, sold out', () => {
    const deals = rankDeals([
      candidate({ id: 'draft', status: 'draft' }),
      candidate({ id: 'paused', status: 'paused' }),
      candidate({ id: 'soldout', stock_quantity: 0 }),
      candidate({ id: 'untracked', stock_quantity: null }),
      candidate({ id: 'stocked', stock_quantity: 3 }),
    ])
    expect(deals.map((d) => d.id).sort()).toEqual(['stocked', 'untracked'])
  })

  it('breaks a tie by lower price then id, so two runs agree', () => {
    const rows = [
      candidate({ id: 'b', kenyon_price_agorot: 500, full_price_agorot: 1000 }),
      candidate({ id: 'a', kenyon_price_agorot: 500, full_price_agorot: 1000 }),
      candidate({ id: 'c', kenyon_price_agorot: 400, full_price_agorot: 800 }),
    ]
    expect(rankDeals(rows).map((d) => d.id)).toEqual(['c', 'a', 'b'])
    expect(rankDeals([...rows].reverse()).map((d) => d.id)).toEqual(['c', 'a', 'b'])
  })

  it('caps the set at the grid size', () => {
    const rows = Array.from({ length: 40 }, (_, i) => candidate({ id: `p${i}` }))
    expect(rankDeals(rows)).toHaveLength(32)
    expect(rankDeals(rows, 3)).toHaveLength(3)
  })
})

/**
 * A supabase-js-shaped stub routed by table. Each call to `from(table)` pops
 * the next scripted result for that table, and every builder method chains.
 */
function stubAdmin(script: Record<string, { data?: unknown; error?: unknown }[]>) {
  const calls: { table: string; op: string; payload?: unknown }[] = []
  const admin = {
    from: (table: string) => {
      const next = script[table]?.shift() ?? { data: null, error: null }
      const p = Promise.resolve({ data: next.data ?? null, error: next.error ?? null })
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'lte', 'order', 'limit', 'maybeSingle']) c[m] = () => c
      c.update = (payload: unknown) => {
        calls.push({ table, op: 'update', payload })
        return c
      }
      c.insert = (payload: unknown) => {
        calls.push({ table, op: 'insert', payload })
        return c
      }
      // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable like the real one
      c.then = p.then.bind(p)
      return c
    },
  }
  return { admin: admin as never, calls }
}

const NOW = new Date('2026-09-17T00:00:00Z')

describe('applyDueScheduledPriceChanges', () => {
  it('writes the ILS source columns, the history row with source=change, then the stamp', async () => {
    const { admin, calls } = stubAdmin({
      scheduled_price_changes: [
        {
          data: [
            {
              id: 'c1',
              product_id: 'p1',
              effective_at: '2026-09-16T22:00:00Z',
              price_agorot: 9900,
              reference_agorot: 15000,
            },
          ],
        },
        {}, // the applied_at stamp
      ],
      products: [
        { data: { id: 'p1', status: 'active', full_price_agorot: 20000, deleted_at: null } },
        {}, // the price write
      ],
      price_history: [{}],
    })

    const result = await applyDueScheduledPriceChanges(admin, { now: NOW, today: '2026-09-17' })

    expect(result).toEqual({ due: 1, applied: 1, failed: 0, productIds: ['p1'] })
    expect(calls).toEqual([
      { table: 'products', op: 'update', payload: { kenyon_price: 99, full_price: 150 } },
      {
        table: 'price_history',
        op: 'insert',
        payload: {
          product_id: 'p1',
          observed_on: '2026-09-17',
          price_agorot: 9900,
          reference_agorot: 15000,
          status: 'active',
          source: 'change',
        },
      },
      {
        table: 'scheduled_price_changes',
        op: 'update',
        payload: { applied_at: NOW.toISOString(), last_error: null },
      },
    ])
  })

  it('leaves the reference alone when the row does not set one, and records the one in force', async () => {
    const { admin, calls } = stubAdmin({
      scheduled_price_changes: [
        {
          data: [
            {
              id: 'c1',
              product_id: 'p1',
              effective_at: '2026-09-16T22:00:00Z',
              price_agorot: 5000,
              reference_agorot: null,
            },
          ],
        },
        {},
      ],
      products: [
        { data: { id: 'p1', status: 'active', full_price_agorot: 8000, deleted_at: null } },
        {},
      ],
      price_history: [{}],
    })
    await applyDueScheduledPriceChanges(admin, { now: NOW, today: '2026-09-17' })
    expect(calls[0]).toEqual({ table: 'products', op: 'update', payload: { kenyon_price: 50 } })
    expect((calls[1]?.payload as { reference_agorot: number }).reference_agorot).toBe(8000)
  })

  it('records the failure on the row and keeps going; the row stays due', async () => {
    const { admin, calls } = stubAdmin({
      scheduled_price_changes: [
        {
          data: [
            {
              id: 'gone',
              product_id: 'missing',
              effective_at: '2026-09-16T22:00:00Z',
              price_agorot: 100,
              reference_agorot: null,
            },
            {
              id: 'ok',
              product_id: 'p2',
              effective_at: '2026-09-16T23:00:00Z',
              price_agorot: 100,
              reference_agorot: null,
            },
          ],
        },
        {}, // last_error write for `gone`
        {}, // applied_at stamp for `ok`
      ],
      products: [
        { data: null }, // missing product
        { data: { id: 'p2', status: 'active', full_price_agorot: null, deleted_at: null } },
        {},
      ],
      price_history: [{}],
    })
    const result = await applyDueScheduledPriceChanges(admin, { now: NOW, today: '2026-09-17' })
    expect(result).toEqual({ due: 2, applied: 1, failed: 1, productIds: ['p2'] })
    const errorWrite = calls.find(
      (c) =>
        c.table === 'scheduled_price_changes' && (c.payload as { last_error?: string }).last_error,
    )
    expect(errorWrite?.payload).toEqual({ last_error: 'product not found' })
  })

  it('refuses a non-integer price before touching the product', async () => {
    const { admin, calls } = stubAdmin({
      scheduled_price_changes: [
        {
          data: [
            {
              id: 'c1',
              product_id: 'p1',
              effective_at: '2026-09-16T22:00:00Z',
              price_agorot: 99.5,
              reference_agorot: null,
            },
          ],
        },
        {},
      ],
    })
    const result = await applyDueScheduledPriceChanges(admin, { now: NOW, today: '2026-09-17' })
    expect(result.failed).toBe(1)
    expect(calls.filter((c) => c.table === 'products')).toEqual([])
  })

  it('throws when the schedule itself cannot be read', async () => {
    const { admin } = stubAdmin({
      scheduled_price_changes: [{ error: { message: 'relation does not exist' } }],
    })
    await expect(
      applyDueScheduledPriceChanges(admin, { now: NOW, today: '2026-09-17' }),
    ).rejects.toThrow(/relation does not exist/)
  })
})
