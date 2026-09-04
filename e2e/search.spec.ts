import fs from 'node:fs'
import path from 'node:path'
import { type APIRequestContext, expect, test } from '@playwright/test'

/**
 * Full-text search (migration 171): the `search_products` RPC and the
 * /api/search route that rides it.
 *
 * Catalog content is DB-driven and Hebrew, so like helpers.ts these specs
 * discover a real product at runtime instead of hard-coding a name that rots
 * with the seed: each test derives its query from a product the database
 * itself returned, then asserts the search finds that same product again.
 */

/**
 * The Playwright process is not Next, so .env.local is not loaded for it.
 * The two public values are read from the environment when CI provides them
 * and parsed out of .env.local otherwise; with neither, the PostgREST specs
 * skip and say why rather than failing on a missing URL.
 */
function supabaseEnv(): { url: string; anonKey: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
      const read = (name: string) =>
        new RegExp(`^${name}=(.+)$`, 'm').exec(raw)?.[1]?.trim() ?? undefined
      url = url || read('NEXT_PUBLIC_SUPABASE_URL')
      anonKey = anonKey || read('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    } catch {
      return null
    }
  }
  return url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null
}

type CatalogProduct = { id: string; name_he: string }

/** Active products as anon RLS serves them, newest first. */
async function activeProducts(request: APIRequestContext): Promise<CatalogProduct[]> {
  const env = supabaseEnv()
  if (!env) return []
  const res = await request.get(
    `${env.url}/rest/v1/products?select=id,name_he&status=eq.active&deleted_at=is.null&order=created_at.desc&limit=20`,
    { headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` } },
  )
  if (!res.ok()) return []
  return (await res.json()) as CatalogProduct[]
}

/** Words of a product name as the `simple` config will have indexed them. */
function searchableWords(name: string): string[] {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .map((w) => w.toLowerCase())
}

async function callSearchRpc(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ status: number; rows: { id: string; name_he: string; rank: number }[] }> {
  const env = supabaseEnv()
  if (!env) throw new Error('supabase env missing')
  const res = await request.post(`${env.url}/rest/v1/rpc/search_products`, {
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      'Content-Type': 'application/json',
    },
    data: body,
  })
  const rows = res.ok() ? await res.json() : []
  return { status: res.status(), rows }
}

test.describe('search_products RPC over PostgREST, as anon', () => {
  test.skip(!supabaseEnv(), 'NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not available to Playwright')

  test('finds a live product by a word of its own name', async ({ request }) => {
    const products = await activeProducts(request)
    const product = products.find((p) => searchableWords(p.name_he).length > 0)
    test.skip(!product, 'no active product with a searchable name in the catalog')
    if (!product) return

    const word = searchableWords(product.name_he)[0] as string
    const { status, rows } = await callSearchRpc(request, { q: word, max_results: 100 })

    expect(status).toBe(200)
    expect(rows.map((r) => r.id)).toContain(product.id)
  })

  test('matches a prefix while the shopper is still typing', async ({ request }) => {
    const products = await activeProducts(request)
    const product = products.find((p) => searchableWords(p.name_he).some((w) => w.length >= 3))
    test.skip(!product, 'no active product with a 3+ letter word in its name')
    if (!product) return

    const word = searchableWords(product.name_he).find((w) => w.length >= 3) as string
    const { status, rows } = await callSearchRpc(request, {
      q: word.slice(0, word.length - 1),
      max_results: 100,
    })

    expect(status).toBe(200)
    expect(rows.map((r) => r.id)).toContain(product.id)
  })

  test('matches the words of a name in any order', async ({ request }) => {
    const products = await activeProducts(request)
    const product = products.find((p) => searchableWords(p.name_he).length >= 2)
    test.skip(!product, 'no active product with a two-word name in the catalog')
    if (!product) return

    const [first, second] = searchableWords(product.name_he)
    const { status, rows } = await callSearchRpc(request, {
      q: `${second} ${first}`,
      max_results: 100,
    })

    expect(status).toBe(200)
    expect(rows.map((r) => r.id)).toContain(product.id)
  })

  test('tsquery syntax in the input is a search term, never an operator', async ({ request }) => {
    // Every one of these would be a to_tsquery syntax error if user input
    // reached the parser; fts_prefix_query strips them, so the answer is an
    // ordinary (empty) result set, not a 400.
    const { status, rows } = await callSearchRpc(request, { q: '!&|:*()' })

    expect(status).toBe(200)
    expect(rows).toEqual([])
  })
})

test.describe('/api/search rides the FTS engine', () => {
  test('serves a product found by a word of its own name', async ({ request }) => {
    test.skip(!supabaseEnv(), 'catalog discovery needs the Supabase env')
    const products = await activeProducts(request)
    const product = products.find((p) => searchableWords(p.name_he).length > 0)
    test.skip(!product, 'no active product with a searchable name in the catalog')
    if (!product) return

    const word = searchableWords(product.name_he)[0] as string
    const res = await request.get(`/api/search?q=${encodeURIComponent(word)}&limit=40`)

    expect(res.status()).toBe(200)
    const body = (await res.json()) as { results: { id: string }[] }
    expect(body.results.map((r) => r.id)).toContain(product.id)
  })

  test('answers gibberish with an empty result list, not an error', async ({ request }) => {
    const res = await request.get('/api/search?q=זזזחחחקקק')

    expect(res.status()).toBe(200)
    const body = (await res.json()) as { results: unknown[]; error?: string }
    expect(body.results).toEqual([])
    expect(body.error).toBeUndefined()
  })
})
