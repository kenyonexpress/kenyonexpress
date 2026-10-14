import type { ProductDocument } from '@/lib/search/meili-settings'

/**
 * Faceted search: parameter validation, Meilisearch filter building, and the
 * Postgres-fallback facet counting. Kept out of the route so every rule here
 * is a unit test away, and so the route stays the thin transport it should be.
 *
 * The validation exists for one reason (ARCHITECTURE-SEARCH-DISCOVERY.md
 * section 6): facet values are validated against the known filterable set
 * before being passed through, so a crafted parameter cannot become a filter
 * expression.
 */

/** The facets the endpoint exposes. A strict subset of FILTERABLE_ATTRIBUTES. */
export const FACET_ATTRIBUTES = [
  'type',
  'category_slug',
  'city',
  'brand',
  'tags',
  'in_stock',
  'supplier_id',
  'discount_bp',
] as const

/**
 * The facets an index built before `discount_bp` existed can answer. Asking
 * such an index for the full list is a 400 on the whole search, so the engine
 * retries with this one rather than losing Meilisearch for every query until
 * the next reindex.
 */
export const LEGACY_FACET_ATTRIBUTES = FACET_ATTRIBUTES.filter(
  (attribute) => attribute !== 'discount_bp',
)

/**
 * The discount facet's thresholds, in whole percent of the full price: "at
 * least this much off". A fixed list, so the parameter is validated against
 * it and can never reach a filter expression as free text. These are filter
 * bounds on a ranking key, not rates applied to any amount.
 */
export const DISCOUNT_STEPS = [10, 25, 50] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mirrors resolveStorefrontProductType: the four types the storefront names. */
const PRODUCT_TYPES = ['coupon', 'physical', 'service', 'recurring'] as const

const SORTS = ['price_asc', 'price_desc', 'newest', 'discount_desc'] as const
export type FacetedSort = (typeof SORTS)[number]

export type FacetedSearchParams = {
  q: string
  type?: (typeof PRODUCT_TYPES)[number]
  category?: string
  /**
   * `category` widened to its whole subtree, by the engine and never by the
   * URL: choosing a parent category shows what sits under its children too.
   * Absent means the one slug in `category`.
   */
  categorySlugs?: readonly string[]
  /** A supplier id. The facet's label is the supplier's public name. */
  supplier?: string
  /** One of `DISCOUNT_STEPS`: at least this many percent off the full price. */
  discountMin?: number
  city?: string
  brand?: string
  tag?: string
  inStock?: boolean
  /**
   * Whole shekels: the catalogue columns `kenyon_price`/`full_price` are
   * numeric shekels (admin/bulk-price.ts), and the filter compares against
   * them directly. Integers only, so the parser can refuse rather than round.
   */
  priceMin?: number
  priceMax?: number
  sort?: FacetedSort
  limit: number
  offset: number
}

export type ParseOutcome = { ok: true; params: FacetedSearchParams } | { ok: false; error: string }

const MAX_VALUE_LENGTH = 100
const MAX_LIMIT = 48
const DEFAULT_LIMIT = 24
const MAX_OFFSET = 1000

/**
 * A facet value the filter will carry as a literal. Length-capped, control
 * characters refused; quoting is the filter builder's job, not the parser's.
 */
function readValue(searchParams: URLSearchParams, name: string): string | undefined {
  const raw = searchParams.get(name)?.trim()
  if (!raw) return undefined
  if (raw.length > MAX_VALUE_LENGTH) return undefined
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control chars is the point
  if (/[\u0000-\u001F\u007F]/.test(raw)) return undefined
  return raw
}

/**
 * Whole shekels, or undefined, or an explicit refusal. "12.50" is not a
 * bound anyone types into a facet URL, it is a caller reaching for the money
 * path; it must 400, never round.
 */
function readAgorot(searchParams: URLSearchParams, name: string): number | undefined | 'invalid' {
  const raw = searchParams.get(name)?.trim()
  if (!raw) return undefined
  if (!/^\d{1,12}$/.test(raw)) return 'invalid'
  return Number(raw)
}

export function parseFacetedParams(searchParams: URLSearchParams): ParseOutcome {
  const q = searchParams.get('q')?.trim() ?? ''

  const type = readValue(searchParams, 'type')
  if (type && !(PRODUCT_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: 'invalid_type' }
  }

  const sort = readValue(searchParams, 'sort')
  if (sort && !(SORTS as readonly string[]).includes(sort)) {
    return { ok: false, error: 'invalid_sort' }
  }

  const supplier = readValue(searchParams, 'supplier')
  if (supplier && !UUID.test(supplier)) return { ok: false, error: 'invalid_supplier' }

  const discountRaw = searchParams.get('discount_min')?.trim()
  let discountMin: number | undefined
  if (discountRaw) {
    discountMin = (DISCOUNT_STEPS as readonly number[]).find((step) => String(step) === discountRaw)
    if (discountMin === undefined) return { ok: false, error: 'invalid_discount' }
  }

  const priceMin = readAgorot(searchParams, 'price_min')
  if (priceMin === 'invalid') return { ok: false, error: 'invalid_price' }
  const priceMax = readAgorot(searchParams, 'price_max')
  if (priceMax === 'invalid') return { ok: false, error: 'invalid_price' }
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    return { ok: false, error: 'invalid_price' }
  }

  const inStockRaw = searchParams.get('in_stock')
  if (inStockRaw !== null && inStockRaw !== 'true' && inStockRaw !== 'false') {
    return { ok: false, error: 'invalid_in_stock' }
  }

  const limitRaw = Number(searchParams.get('limit'))
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT
  const offsetRaw = Number(searchParams.get('offset'))
  const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? Math.min(offsetRaw, MAX_OFFSET) : 0

  return {
    ok: true,
    params: {
      q,
      type: type as FacetedSearchParams['type'],
      category: readValue(searchParams, 'category'),
      supplier,
      discountMin,
      city: readValue(searchParams, 'city'),
      brand: readValue(searchParams, 'brand'),
      tag: readValue(searchParams, 'tag'),
      inStock: inStockRaw === null ? undefined : inStockRaw === 'true',
      priceMin,
      priceMax,
      sort: sort as FacetedSearchParams['sort'],
      limit,
      offset,
    },
  }
}

/**
 * A string literal inside a Meilisearch filter expression. Double-quoted,
 * with backslash and the quote itself escaped, so the value can only ever be
 * a value.
 */
export function escapeMeiliFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** The slugs the category filter accepts: the expanded subtree, else the one named. */
function categoryFilterSlugs(params: FacetedSearchParams): readonly string[] {
  if (params.categorySlugs && params.categorySlugs.length > 0) return params.categorySlugs
  return params.category ? [params.category] : []
}

/** The filter array for the Meilisearch request body. ANDed by the engine. */
export function buildMeiliFilters(params: FacetedSearchParams): string[] {
  const filters: string[] = []
  if (params.type) filters.push(`type = ${escapeMeiliFilterValue(params.type)}`)
  const slugs = categoryFilterSlugs(params)
  if (slugs.length === 1) {
    filters.push(`category_slug = ${escapeMeiliFilterValue(slugs[0] as string)}`)
  } else if (slugs.length > 1) {
    filters.push(`category_slug IN [${slugs.map(escapeMeiliFilterValue).join(', ')}]`)
  }
  if (params.supplier) filters.push(`supplier_id = ${escapeMeiliFilterValue(params.supplier)}`)
  if (params.discountMin !== undefined) filters.push(`discount_bp >= ${params.discountMin * 100}`)
  if (params.city) filters.push(`city = ${escapeMeiliFilterValue(params.city)}`)
  if (params.brand) filters.push(`brand = ${escapeMeiliFilterValue(params.brand)}`)
  if (params.tag) filters.push(`tags = ${escapeMeiliFilterValue(params.tag)}`)
  if (params.inStock !== undefined) filters.push(`in_stock = ${params.inStock}`)
  if (params.priceMin !== undefined) filters.push(`kenyon_price >= ${params.priceMin}`)
  if (params.priceMax !== undefined) filters.push(`kenyon_price <= ${params.priceMax}`)
  return filters
}

/** Maps the endpoint's sort names onto Meilisearch sort clauses. */
export function buildMeiliSort(sort: FacetedSort | undefined): string[] | undefined {
  switch (sort) {
    case 'price_asc':
      return ['kenyon_price:asc']
    case 'price_desc':
      return ['kenyon_price:desc']
    case 'newest':
      return ['created_at:desc']
    case 'discount_desc':
      return ['discount_bp:desc']
    default:
      return undefined
  }
}

export type FacetDistribution = Record<string, Record<string, number>>

/**
 * The fallback's facet counting, over documents that already match every
 * filter. Same semantics Meilisearch applies to `facetDistribution`, so the
 * response shape does not depend on which engine answered.
 */
export function computeFacetDistribution(docs: ProductDocument[]): FacetDistribution {
  const distribution: FacetDistribution = {}
  const bump = (facet: string, value: string) => {
    const bucket = distribution[facet] ?? {}
    distribution[facet] = bucket
    bucket[value] = (bucket[value] ?? 0) + 1
  }

  for (const doc of docs) {
    bump('type', doc.type)
    if (doc.category_slug) bump('category_slug', doc.category_slug)
    if (doc.city) bump('city', doc.city)
    if (doc.brand) bump('brand', doc.brand)
    for (const tag of doc.tags) bump('tags', tag)
    bump('in_stock', String(doc.in_stock))
    if (doc.supplier_id) bump('supplier_id', doc.supplier_id)
    bump('discount_bp', String(doc.discount_bp ?? 0))
  }
  return distribution
}

/** The fallback's filters, applied in the same AND the engine would. */
export function applyFacetFilters(
  docs: ProductDocument[],
  params: FacetedSearchParams,
): ProductDocument[] {
  const slugs = categoryFilterSlugs(params)
  return docs.filter((doc) => {
    if (params.type && doc.type !== params.type) return false
    if (slugs.length > 0 && !(doc.category_slug && slugs.includes(doc.category_slug))) return false
    if (params.supplier && doc.supplier_id !== params.supplier) return false
    if (params.discountMin !== undefined && (doc.discount_bp ?? 0) < params.discountMin * 100) {
      return false
    }
    if (params.city && doc.city !== params.city) return false
    if (params.brand && doc.brand !== params.brand) return false
    if (params.tag && !doc.tags.includes(params.tag)) return false
    if (params.inStock !== undefined && doc.in_stock !== params.inStock) return false
    if (params.priceMin !== undefined && (doc.kenyon_price ?? -1) < params.priceMin) return false
    if (params.priceMax !== undefined) {
      if (doc.kenyon_price == null || doc.kenyon_price > params.priceMax) return false
    }
    return true
  })
}

/** The fallback's ordering. Relevance order is the query's own row order. */
export function sortDocs(
  docs: ProductDocument[],
  sort: FacetedSort | undefined,
): ProductDocument[] {
  if (!sort) return docs
  const sorted = [...docs]
  switch (sort) {
    case 'price_asc':
      sorted.sort(
        (a, b) =>
          (a.kenyon_price ?? Number.POSITIVE_INFINITY) -
          (b.kenyon_price ?? Number.POSITIVE_INFINITY),
      )
      break
    case 'price_desc':
      sorted.sort(
        (a, b) =>
          (b.kenyon_price ?? Number.NEGATIVE_INFINITY) -
          (a.kenyon_price ?? Number.NEGATIVE_INFINITY),
      )
      break
    case 'newest':
      sorted.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      break
    case 'discount_desc':
      // `?? 0`: a document indexed before the field existed has no discount
      // to rank by. Array.prototype.sort is stable, so ties keep relevance.
      sorted.sort((a, b) => (b.discount_bp ?? 0) - (a.discount_bp ?? 0))
      break
  }
  return sorted
}
