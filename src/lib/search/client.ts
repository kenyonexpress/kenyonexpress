import { PRIMARY_KEY, PRODUCTS_INDEX, type ProductDocument } from '@/lib/search/meili-settings'

/**
 * The one place this app talks to Meilisearch.
 *
 * WHY A MODULE AND NOT THE OFFICIAL SDK. Same reason as Cardcom and QStash: the
 * whole surface we use is four endpoints, and an SDK would add a dependency, a
 * bundled version of the engine's own types, and a second place where the index
 * name and the auth header are decided. Every other HTTP integration in this
 * repo is a `fetch` wrapper; this one matches.
 *
 * WHY IT REPLACES THREE COPIES. Before this file, `lib/search/indexer.ts` and
 * `lib/search-server.ts` each had their own `host.replace(/\/$/, '')`, their own
 * `process.env.MEILISEARCH_INDEX ?? 'products'` and their own idea of what an
 * error was - one threw, one swallowed. That is exactly how an index gets
 * written under one name and read under another, and nothing fails loudly.
 *
 * THE TWO ERROR CONTRACTS ARE BOTH DELIBERATE, AND THEY ARE NOT THE SAME:
 *
 *   write path (`upsertDocuments`, `deleteDocument`, `applyIndexSettings`)
 *     THROWS. A failed index write must reach the outbox, which retries it. A
 *     swallowed write is a product that is silently unsearchable forever.
 *
 *   read path (`searchIndex`)
 *     returns null. A shopper's query must never 500 because the engine is
 *     down; the caller falls back to Postgres ILIKE, which is slower and dumber
 *     but is still a search.
 *
 * NOT CONFIGURED IS NOT AN ERROR. `MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` are
 * unset in dev, in tests and in preview environments. Every function here reads
 * as a no-op (writes) or as null (reads) in that state, so the whole pipeline
 * stays wired and silent until the engine appears.
 */

export interface MeiliConfig {
  host: string
  apiKey: string
  index: string
}

/** Never let a hung engine hold a request open; the fallback is one round-trip away. */
const REQUEST_TIMEOUT_MS = 4_000

export class MeiliError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'MeiliError'
    this.status = status
  }
}

export function meiliConfig(): MeiliConfig | null {
  const host = process.env.MEILISEARCH_HOST
  const apiKey = process.env.MEILISEARCH_API_KEY
  if (!host || !apiKey) return null
  return {
    // Trailing slash removed HERE, once. `${host}/indexes` with a trailing
    // slash gives `//indexes`, which some proxies answer 301 to and `fetch`
    // then re-issues without the Authorization header.
    host: host.replace(/\/+$/, ''),
    apiKey,
    index: PRODUCTS_INDEX,
  }
}

export function meiliConfigured(): boolean {
  return meiliConfig() !== null
}

async function meiliFetch(
  config: MeiliConfig,
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${config.host}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    // Search is request-time and index writes are not idempotent-by-caching;
    // nothing here may be served from a cache.
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

/** Write-path request: throws on anything that is not a success. */
async function meiliWrite(path: string, method: string, body?: unknown): Promise<void> {
  const config = meiliConfig()
  if (!config) return
  const res = await meiliFetch(config, path, method, body)
  // A DELETE of a document that is already gone is the outcome the caller
  // asked for, not a failure. Deletes have to be idempotent: the outbox
  // redelivers, and a retry must not park a job in the dead-letter table.
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new MeiliError(
      `meilisearch ${method} ${path} -> ${res.status} ${await res.text()}`,
      res.status,
    )
  }
}

// --- read path --------------------------------------------------------------

export interface MeiliSearchParams {
  q: string
  limit: number
  offset?: number
  /** Already-built filter expressions, ANDed by the engine. See buildFilter. */
  filter?: string[]
  sort?: string[]
  facets?: string[]
}

export interface MeiliHit extends Partial<ProductDocument> {
  id: string
  slug: string
  name_he: string
}

export interface MeiliSearchResponse {
  hits: MeiliHit[]
  estimatedTotalHits: number
  facetDistribution?: Record<string, Record<string, number>>
}

/**
 * Runs a search. Returns null when the engine is unset, unreachable, slow or
 * angry - every one of which means "use the database instead", and none of
 * which the shopper should ever see.
 */
export async function searchIndex(params: MeiliSearchParams): Promise<MeiliSearchResponse | null> {
  const config = meiliConfig()
  if (!config) return null
  try {
    const res = await meiliFetch(config, `/indexes/${config.index}/search`, 'POST', {
      q: params.q,
      limit: params.limit,
      ...(params.offset ? { offset: params.offset } : {}),
      // Joined with AND rather than passed as an array of arrays: the array
      // form means OR between elements in Meilisearch, which would widen every
      // multi-facet query into a union instead of an intersection.
      ...(params.filter?.length ? { filter: params.filter.join(' AND ') } : {}),
      ...(params.sort?.length ? { sort: params.sort } : {}),
      ...(params.facets?.length ? { facets: params.facets } : {}),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<MeiliSearchResponse>
    return {
      hits: data.hits ?? [],
      estimatedTotalHits: data.estimatedTotalHits ?? (data.hits ?? []).length,
      ...(data.facetDistribution ? { facetDistribution: data.facetDistribution } : {}),
    }
  } catch {
    return null
  }
}

// --- write path -------------------------------------------------------------

export async function upsertDocuments(documents: ProductDocument[]): Promise<void> {
  if (documents.length === 0) return
  const config = meiliConfig()
  if (!config) return
  await meiliWrite(
    `/indexes/${config.index}/documents?primaryKey=${PRIMARY_KEY}`,
    // PUT, not POST: PUT replaces the document wholesale. POST merges field by
    // field, which would leave a field that has become NULL - a product whose
    // city was cleared, say - showing its old value in the facet forever.
    'PUT',
    documents,
  )
}

export async function deleteDocument(productId: string): Promise<void> {
  const config = meiliConfig()
  if (!config) return
  await meiliWrite(`/indexes/${config.index}/documents/${encodeURIComponent(productId)}`, 'DELETE')
}

/** Applies the settings in meili-settings.ts to the live index. */
export async function applyIndexSettings(settings: unknown): Promise<void> {
  const config = meiliConfig()
  if (!config) return
  await meiliWrite(`/indexes/${config.index}/settings`, 'PATCH', settings)
}

// --- filter construction ----------------------------------------------------

/**
 * Quotes a value for a Meilisearch filter expression.
 *
 * THIS IS AN INJECTION BOUNDARY, not formatting. A city name arrives from the
 * query string, and `city = תל אביב` unquoted is a syntax error while
 * `city = "x" OR id EXISTS` unquoted is a filter the caller wrote. Backslashes
 * are escaped before quotes so an input ending in `\` cannot escape the closing
 * quote itself.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export interface SearchFilters {
  categoryId?: string | null
  categorySlug?: string | null
  city?: string | null
  type?: string | null
  /** Inclusive bounds on kenyon_price, in the unit the column already uses. */
  priceMin?: number | null
  priceMax?: number | null
  inStockOnly?: boolean
}

/**
 * Turns the storefront's filter object into Meilisearch filter expressions.
 *
 * Every value is quoted, every number is checked with `Number.isFinite` before
 * it reaches the string, and an absent filter produces no expression at all
 * rather than a tautology like `price >= 0` - which would exclude a product
 * whose price is NULL, silently.
 */
export function buildFilter(filters: SearchFilters): string[] {
  const expressions: string[] = []
  if (filters.categoryId) expressions.push(`category_id = ${quoteFilterValue(filters.categoryId)}`)
  if (filters.categorySlug) {
    expressions.push(`category_slug = ${quoteFilterValue(filters.categorySlug)}`)
  }
  if (filters.city) expressions.push(`city = ${quoteFilterValue(filters.city)}`)
  if (filters.type) expressions.push(`type = ${quoteFilterValue(filters.type)}`)
  if (typeof filters.priceMin === 'number' && Number.isFinite(filters.priceMin)) {
    expressions.push(`kenyon_price >= ${filters.priceMin}`)
  }
  if (typeof filters.priceMax === 'number' && Number.isFinite(filters.priceMax)) {
    expressions.push(`kenyon_price <= ${filters.priceMax}`)
  }
  if (filters.inStockOnly) expressions.push('in_stock = true')
  return expressions
}
