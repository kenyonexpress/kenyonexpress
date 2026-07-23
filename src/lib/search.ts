// Client-side search API wrapper around GET /api/search. When the Meilisearch
// Worker is later introduced, only this module changes.

export type SearchResult = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  image: string | null
  category: string | null
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
  error?: string
}

export async function searchProducts(
  q: string,
  opts: { category?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q })
  if (opts.category) params.set('category', opts.category)
  if (opts.limit) params.set('limit', String(opts.limit))

  const res = await fetch(`/api/search?${params.toString()}`, { signal: opts.signal })
  if (!res.ok) {
    return { query: q, results: [], error: `search failed (${res.status})` }
  }
  return (await res.json()) as SearchResponse
}
