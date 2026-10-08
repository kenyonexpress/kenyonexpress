import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The compare read runs on the user client (RLS on `products` is the
 * enforcement). What can only fail here: the ids are cleaned before the
 * query, the answer keeps the caller's order, a hidden or inactive row is
 * dropped rather than painted, and a read error is a Hebrew sentence.
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const calls: { table: string; select: string; filters: [string, unknown[]][] }[] = []
let answer: { data: unknown; error: unknown } = { data: [], error: null }

function builder(table: string, select: string) {
  const record = { table, select, filters: [] as [string, unknown[]][] }
  calls.push(record)
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(answer).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.filters.push([String(prop), args])
          return proxy
        }
      },
    },
  )
  return proxy
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({ select: (s: string) => builder(table, s) }),
  }),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

const { getCompareView } = await import('./compare')

function product(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name_he: `מוצר ${id.slice(0, 1)}`,
    slug: `p-${id.slice(0, 1)}`,
    images: [],
    kenyon_price: 10,
    price_ils: 10,
    full_price: null,
    stock_quantity: 1,
    status: 'active',
    deleted_at: null,
    type: 'coupon',
    is_coupon_enabled: true,
    brand: null,
    sku: null,
    city: null,
    cashback_percent: 0,
    requires_shipping: false,
    short_description_he: null,
    highlights: [],
    attributes: {},
    category: null,
    supplier: null,
    ...over,
  }
}

beforeEach(() => {
  calls.length = 0
  answer = { data: [], error: null }
})

describe('getCompareView', () => {
  it('answers an empty list without touching the database', async () => {
    expect(await getCompareView([])).toEqual({ ok: true, items: [] })
    expect(await getCompareView('nope')).toEqual({ ok: true, items: [] })
    expect(await getCompareView(['ke-deal-9132'])).toEqual({ ok: true, items: [] })
    expect(calls).toHaveLength(0)
  })

  it('reads products by the cleaned ids and keeps the caller order', async () => {
    answer = { data: [product(B), product(A)], error: null }
    const state = await getCompareView([A, 'junk', A, B])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.table).toBe('products')
    expect(calls[0]?.select).toContain('category:categories(name_he, slug)')
    expect(calls[0]?.select).toContain('supplier:suppliers(name)')
    expect(calls[0]?.filters).toEqual([['in', ['id', [A, B]]]])
    expect(state.ok && state.items.map((i) => i.productId)).toEqual([A, B])
  })

  it('drops an id the policy hid and a row that is not live', async () => {
    answer = {
      data: [product(A), product(B, { status: 'draft' }), product(C, { deleted_at: 'x' })],
      error: null,
    }
    const state = await getCompareView([C, B, A])
    expect(state.ok && state.items.map((i) => i.productId)).toEqual([A])
  })

  it('caps the query at four ids', async () => {
    const ids = [
      A,
      B,
      C,
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ]
    await getCompareView(ids)
    expect((calls[0]?.filters[0]?.[1][1] as string[]).length).toBe(4)
  })

  it('turns a read error into a sentence', async () => {
    answer = { data: null, error: { code: '500', message: 'boom' } }
    expect(await getCompareView([A])).toEqual({
      ok: false,
      error: 'לא הצלחנו לטעון את המוצרים להשוואה.',
    })
  })
})
