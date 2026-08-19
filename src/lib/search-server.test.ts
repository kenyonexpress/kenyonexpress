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

type Recorded = { orGroups: string[]; eqPairs: [string, unknown][] }
let recorded: Recorded

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
  createClient: async () => ({ from: () => fakeQuery() }),
}))

const { searchProductsServer } = await import('./search-server')

beforeEach(() => {
  recorded = { orGroups: [], eqPairs: [] }
  vi.clearAllMocks()
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
})
