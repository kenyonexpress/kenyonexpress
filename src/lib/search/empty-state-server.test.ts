import { beforeEach, describe, expect, it, vi } from 'vitest'

const searches: string[] = []
let totals: Record<string, number | 'error'> = {}

vi.mock('@/lib/search/faceted-server', () => ({
  facetedSearchCached: async (params: URLSearchParams) => {
    const q = params.get('q') ?? ''
    searches.push(params.toString())
    const total = totals[q]
    if (total === 'error') return { error: 'search_failed' }
    return { query: q, results: [], total: total ?? 0, facets: {}, engine: 'database' }
  },
}))

const { verifyEmptySearch } = await import('./empty-state-server')

/**
 * UX21: "did you mean" and "show all N results without the filter" are
 * asked of the engine before they are printed, one `limit=1` search each.
 */
describe('verifyEmptySearch', () => {
  beforeEach(() => {
    searches.length = 0
    totals = {}
  })

  it('offers the bare query with its count on a narrowed search', async () => {
    totals = { ספא: 9 }
    const out = await verifyEmptySearch({
      q: 'ספא',
      params: new URLSearchParams('q=ספא&city=חיפה&sort=newest'),
      narrowed: true,
    })
    expect(out.unfiltered).toEqual({ total: 9, href: '/search?q=%D7%A1%D7%A4%D7%90&sort=newest' })
    expect(searches).toEqual(['q=%D7%A1%D7%A4%D7%90&limit=1'])
  })

  it('reports zero rather than hiding it, so the page can say widening will not help', async () => {
    totals = { ספא: 0 }
    const out = await verifyEmptySearch({
      q: 'ספא',
      params: new URLSearchParams('q=ספא&city=חיפה'),
      narrowed: true,
    })
    expect(out.unfiltered).toEqual({ total: 0, href: '/search?q=%D7%A1%D7%A4%D7%90' })
  })

  it('does not ask about the bare query when nothing narrowed it', async () => {
    totals = { 'ספא זוגי': 0, זוגי: 4 }
    const out = await verifyEmptySearch({
      q: 'ספא זוגי',
      params: new URLSearchParams('q=ספא זוגי'),
      narrowed: false,
    })
    expect(out.unfiltered).toBeNull()
    expect(searches).toHaveLength(1)
  })

  it('offers the relaxed query only when it finds something', async () => {
    // relaxQuery drops the SHORTEST word ("ספא", three letters), so the
    // relaxed query here is "זוגי"; what is pinned is that it is asked first.
    totals = { 'ספא זוגי': 0, זוגי: 4 }
    const found = await verifyEmptySearch({
      q: 'ספא זוגי',
      params: new URLSearchParams('q=ספא זוגי'),
      narrowed: false,
    })
    expect(found.relaxed).toEqual({
      query: 'זוגי',
      total: 4,
      href: `/search?q=${encodeURIComponent('זוגי')}`,
    })

    totals = { 'ספא זוגי': 0, זוגי: 0 }
    const none = await verifyEmptySearch({
      q: 'ספא זוגי',
      params: new URLSearchParams('q=ספא זוגי'),
      narrowed: false,
    })
    expect(none.relaxed).toBeNull()
  })

  it('never offers a relaxed query under the two-character floor', async () => {
    totals = { בית: 0, ית: 3 }
    const out = await verifyEmptySearch({
      q: 'בית',
      params: new URLSearchParams('q=בית'),
      narrowed: false,
    })
    // "בית" keeps its first letter (relaxQuery's own rule), so nothing is asked.
    expect(out.relaxed).toBeNull()
    expect(searches).toEqual([])
  })

  it('turns an engine error into nulls', async () => {
    totals = { הספא: 'error', ספא: 'error' }
    const out = await verifyEmptySearch({
      q: 'הספא',
      params: new URLSearchParams('q=הספא&city=חיפה'),
      narrowed: true,
    })
    expect(out).toEqual({ unfiltered: null, relaxed: null })
  })
})
