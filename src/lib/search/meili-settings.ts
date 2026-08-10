/**
 * Meilisearch index settings for the product catalogue.
 *
 * Kept as data in src/ rather than inline in the setup script so the choices
 * are testable and reviewable, and so the server and the setup script cannot
 * drift on what the index is supposed to contain.
 */

export const PRODUCTS_INDEX = process.env.MEILISEARCH_INDEX ?? 'products'
export const PRIMARY_KEY = 'id'

/**
 * Typo tolerance, tuned for Hebrew.
 *
 * Meilisearch's defaults allow one typo from 5 characters and two from 9.
 * Those are calibrated for European languages. Hebrew is written without
 * vowels, so its words are systematically shorter: מסעדה is 5 letters, בגד is
 * 3, ספא is 3. At the default threshold a shopper who types מסעדח instead of
 * מסעדה gets nothing back, because the word is one character under the limit
 * for the whole of its length.
 *
 * Dropping to 4 and 7 restores a typo budget proportional to how Hebrew is
 * actually spelled. It is not lowered further: at three characters almost every
 * Hebrew word is one edit from several unrelated others, and the results stop
 * being about what was typed.
 */
export const TYPO_TOLERANCE = {
  enabled: true,
  minWordSizeForTypos: { oneTypo: 4, twoTypos: 7 },
  // Never fuzzy-match an identifier: a one-character slip in a SKU should
  // return nothing rather than a confidently wrong product.
  disableOnAttributes: ['sku', 'slug', 'barcode'],
} as const

/**
 * Search order. `searchableAttributes` is ordered: Meilisearch treats position
 * in this list as an importance ranking, so a hit in the name outranks the same
 * word buried in a description.
 */
export const SEARCHABLE_ATTRIBUTES = [
  'name_he',
  'name_en',
  'brand',
  'category_name_he',
  // Above the descriptions on purpose: "מסעדה תל אביב" is a place-and-thing
  // query, and a city hit is a stronger signal about what the shopper wants
  // than the same word appearing somewhere in a paragraph of marketing copy.
  'city',
  'tags',
  'supplier_name',
  'short_description_he',
  'description_he',
  'sku',
] as const

/** Every facet the archives and the search page can filter on. */
export const FILTERABLE_ATTRIBUTES = [
  'type',
  'category_id',
  'category_slug',
  // The effective city: products.city when set, the supplier's otherwise. The
  // indexer resolves that COALESCE once, so the facet cannot disagree with the
  // catalogue's own `productLocation()`.
  'city',
  'tags',
  'supplier_id',
  'kenyon_price',
  'in_stock',
] as const

export const SORTABLE_ATTRIBUTES = ['kenyon_price', 'created_at'] as const

/**
 * Ranking rules. The Meilisearch default, plus `in_stock:desc` ahead of
 * proximity: a shopper is better served by an in-stock near-match than by an
 * exact match they cannot buy.
 */
export const RANKING_RULES = [
  'words',
  'typo',
  'in_stock:desc',
  'proximity',
  'attribute',
  'sort',
  'exactness',
] as const

/**
 * Hebrew has no articles or prepositions written as separate short words the
 * way English does, but these conjunctions and fillers show up in product
 * titles often enough to dilute relevance.
 */
export const STOP_WORDS = ['של', 'עם', 'את', 'או', 'גם', 'זה', 'הוא', 'היא'] as const

export const INDEX_SETTINGS = {
  searchableAttributes: [...SEARCHABLE_ATTRIBUTES],
  filterableAttributes: [...FILTERABLE_ATTRIBUTES],
  sortableAttributes: [...SORTABLE_ATTRIBUTES],
  rankingRules: [...RANKING_RULES],
  stopWords: [...STOP_WORDS],
  typoTolerance: {
    enabled: TYPO_TOLERANCE.enabled,
    minWordSizeForTypos: { ...TYPO_TOLERANCE.minWordSizeForTypos },
    disableOnAttributes: [...TYPO_TOLERANCE.disableOnAttributes],
  },
}

/** The row shape pushed into the index. */
export interface ProductDocument {
  id: string
  slug: string
  name_he: string
  name_en: string | null
  brand: string | null
  short_description_he: string | null
  description_he: string | null
  sku: string | null
  type: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  in_stock: boolean
  category_id: string | null
  category_slug: string | null
  category_name_he: string | null
  supplier_id: string | null
  supplier_name: string | null
  /** Effective city: products.city, else the supplier's. Null when neither. */
  city: string | null
  /** Always an array. Absent or NULL in the row reads as no tags. */
  tags: string[]
  created_at: string | null
}

type ProductSource = {
  id: string
  slug: string
  name_he: string
  name_en?: string | null
  brand?: string | null
  short_description_he?: string | null
  description_he?: string | null
  sku?: string | null
  type?: string | null
  is_coupon_enabled?: boolean | null
  kenyon_price?: number | null
  full_price?: number | null
  images?: unknown
  stock_quantity?: number | null
  category_id?: string | null
  supplier_id?: string | null
  created_at?: string | null
  categories?: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

/**
 * Maps a products row to its index document.
 *
 * `in_stock` is precomputed rather than derived at query time because it is a
 * ranking rule, and Meilisearch can only rank on a stored field. A null stock
 * means "not tracked", which is in stock — the same reading the cart uses.
 */
/**
 * `products.city` and `products.tags` reach the row only when the query selects
 * them, and both are recent columns. Read defensively rather than widening
 * `ProductSource`: an absent column must index as "no city"/"no tags", never
 * crash the indexer and leave the whole catalogue unsearchable.
 */
function readCity(row: unknown): string | null {
  const value = (row as Record<string, unknown> | null)?.city
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readTags(row: unknown): string[] {
  const value = (row as Record<string, unknown> | null)?.tags
  if (!Array.isArray(value)) return []
  return value.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

export function toProductDocument(
  row: ProductSource,
  supplierName: string | null = null,
  supplierCity: string | null = null,
): ProductDocument {
  const category = Array.isArray(row.categories)
    ? (row.categories[0] ?? null)
    : (row.categories ?? null)

  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    name_en: row.name_en ?? null,
    brand: row.brand ?? null,
    short_description_he: row.short_description_he ?? null,
    description_he: row.description_he ?? null,
    sku: row.sku ?? null,
    // Mirrors lib/cart/pricing.ts: a product flagged coupon-enabled IS a coupon
    // for every customer-facing purpose, whatever its `type` column says.
    type: row.type === 'coupon' || row.is_coupon_enabled ? 'coupon' : (row.type ?? 'physical'),
    kenyon_price: row.kenyon_price ?? null,
    full_price: row.full_price ?? null,
    images: row.images ?? [],
    stock_quantity: row.stock_quantity ?? null,
    in_stock: row.stock_quantity == null || row.stock_quantity > 0,
    category_id: row.category_id ?? null,
    category_slug: category?.slug ?? null,
    category_name_he: category?.name_he ?? null,
    supplier_id: row.supplier_id ?? null,
    supplier_name: supplierName,
    // The COALESCE is resolved HERE, once, so the search facet and the
    // catalogue's productLocation() cannot disagree about which city a deal is
    // in. Read defensively: `city` reaches the row only when the query selects
    // it, and every one of the 80 products has it NULL today.
    city: readCity(row) ?? supplierCity ?? null,
    tags: readTags(row),
    created_at: row.created_at ?? null,
  }
}
