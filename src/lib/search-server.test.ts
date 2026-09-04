import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WHAT THIS FILE GUARDS IS THE SHAPE OF THE QUERY, NOT THE ROWS.
 *
 * The bug it exists for is invisible in the returned rows: a phrase search and
 * a per-word search return the same thing whenever the phrase happens to match,
 * and differ only on the queries nobody wrote a fixture for. So the fake client
 * records the filters it was handed and the assertions read those.
 */

const or = vi.fn()
const eq = vi.fn()
const is = vi.fn()
const limit = vi.fn()
const rpc = vi.fn()

type Recorded = { orGroups: string[]; eqPairs: [string, unknown][] }
let recorded: Recorded

/**
 * What supabase.rpc('search_products', ...) answers. The default is the
 * missing-function error a database WITHOUT migration 171 produces, so every
 * ILIKE test below is exercising the real fallback branch, not a shortcut.
 */
let rpcResponse: { data: unknown; error: { code?: string; message?: string } | null }

function fakeQuery() {
  const self = {
    select: (..._a: unknown[]) => self,
    eq: (col: string, value: unknown) => {
      recorded.eqPairs.push([col, value])
      eq(col, value)
      return self
    },
    is: (col: string, value: unknown) => {
      is(col, value)
      return self
    },
    or: (expr: string) => {
      recorded.orGroups.push(expr)
      or(expr)
      return self
    },
    limit: (n: number) => {
      limit(n)
      return Promise.resolve({ data: [], count: 0 })
    },
  }
  return self
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => fakeQuery(),
    rpc: (name: string, args: unknown) => {
      rpc(name, args)
      return Promise.resolve(rpcResponse)
    },
  }),
}))

const { searchProductsServer } = await import('./search-server')

beforeEach(() => {
  recorded = { orGroups: [], eqPairs: [] }
  vi.clearAllMocks()
  rpcResponse = {
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function public.search_products' },
  }
  process.env.MEILISEARCH_HOST = ''
  process.env.MEILISEARCH_API_KEY = ''
})

describe('the ILIKE fallback', () => {
  it('asks for every word of the query, not the phrase as one substring', async () => {
    await searchProductsServer('צימר צפון')

    expect(recorded.orGroups).toEqual([
      'name_he.ilike.%צימר%,description_he.ilike.%צימר%',
      'name_he.ilike.%צפון%,description_he.ilike.%צפון%',
    ])
  })

  it('is unchanged for a single word', async () => {
    await searchProductsServer('צימר')

    expect(recorded.orGroups).toEqual(['name_he.ilike.%צימר%,description_he.ilike.%צימר%'])
  })

  it('caps how many groups one query can AND together', async () => {
    await searchProductsServer('a b c d e f g h i j k l')

    expect(recorded.orGroups).toHaveLength(8)
  })

  /**
   * The words are split out of the SANITIZED string, so this is really a test
   * that the split happens on the far side of the escaping: a term that reached
   * the split raw could open a group of its own.
   */
  it('never lets PostgREST syntax out of a word', async () => {
    await searchProductsServer('צימר,or(id.gt.0) %_*"\\ צפון')

    // Every group is exactly the two-column shape and nothing else, so the
    // injected text can only have landed INSIDE a pattern - where it is a
    // search term for a product nobody sells, not a filter.
    expect(recorded.orGroups.length).toBeGreaterThan(0)
    for (const group of recorded.orGroups) {
      expect(group).toMatch(
        /^name_he\.ilike\.%[^,()"\\%_*]*%,description_he\.ilike\.%[^,()"\\%_*]*%$/,
      )
    }
  })

  it('still refuses a query shorter than two characters without touching the db', async () => {
    const outcome = await searchProductsServer('צ')

    expect(outcome).toEqual({ results: [], total: 0, engine: 'database' })
    expect(recorded.orGroups).toEqual([])
  })

  it('keeps the coupon/physical facet in the query so the count stays truthful', async () => {
    await searchProductsServer('צימר צפון', 48, 'coupon')

    expect(recorded.eqPairs).toContainEqual(['type', 'coupon'])
  })

  it('is only reached AFTER the FTS RPC has answered "no such function"', async () => {
    await searchProductsServer('צימר')

    expect(rpc).toHaveBeenCalledWith('search_products', { q: 'צימר', max_results: 48 })
    expect(recorded.orGroups).toHaveLength(1)
  })
})

describe('the search_products FTS path (migration 171)', () => {
  const row = {
    id: 'p1',
    slug: 'airpods-3',
    name_he: 'אוזניות AirPods 3',
    kenyon_price: 499,
    full_price: 749,
    images: ['a.webp'],
    stock_quantity: 4,
    category_name_he: 'אלקטרוניקה',
    category_slug: 'electronics',
    rank: 0.6,
  }

  it('returns the RPC rows in the ProductCard shape without touching ILIKE', async () => {
    rpcResponse = { data: [row], error: null }

    const outcome = await searchProductsServer('אוזניות', 12, 'physical')

    expect(rpc).toHaveBeenCalledWith('search_products', {
      q: 'אוזניות',
      max_results: 12,
      product_type: 'physical',
    })
    expect(outcome).toEqual({
      engine: 'database-fts',
      total: 1,
      results: [
        {
          id: 'p1',
          slug: 'airpods-3',
          name_he: 'אוזניות AirPods 3',
          kenyon_price: 499,
          full_price: 749,
          images: ['a.webp'],
          stock_quantity: 4,
          category: { name_he: 'אלקטרוניקה', slug: 'electronics' },
        },
      ],
    })
    expect(recorded.orGroups).toEqual([])
  })

  it('a product without a category maps to category: null, not a half-empty object', async () => {
    rpcResponse = { data: [{ ...row, category_name_he: null, category_slug: null }], error: null }

    const outcome = await searchProductsServer('אוזניות')

    expect(outcome.results[0]?.category).toBeNull()
  })

  /**
   * A REAL FAILURE MUST NOT FALL THROUGH TO ILIKE. "This database has no FTS"
   * and "the FTS query failed" take different branches on purpose: the first
   * is a working stage-1 setup, the second is an outage that should degrade
   * to empty results (like every other search failure here), not silently
   * halve search quality by running the unindexed scan the index exists to
   * replace.
   */
  it('degrades a genuine RPC error to empty results instead of the ILIKE scan', async () => {
    rpcResponse = { data: null, error: { code: '57014', message: 'canceling statement' } }

    const outcome = await searchProductsServer('אוזניות')

    expect(outcome).toEqual({ results: [], total: 0, engine: 'database-fts' })
    expect(recorded.orGroups).toEqual([])
  })
})
