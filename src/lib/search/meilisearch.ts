import { log } from '@/lib/observability/log'
import {
  BRANDS_INDEX,
  BRANDS_INDEX_SETTINGS,
  CATEGORIES_INDEX,
  CATEGORIES_INDEX_SETTINGS,
  INDEX_SETTINGS,
  PRIMARY_KEY,
  PRODUCTS_INDEX,
  type ProductDocument,
  toBrandDocuments,
  toCategoryDocuments,
  toProductDocument,
} from '@/lib/search/meili-settings'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Meilisearch indexing service: the two indexes, their typed settings, the
 * Hebrew tokenization config, and the full rebuild (`reindexAll`).
 *
 * This sits beside the incremental path (`indexer.ts`, one product per QStash
 * job) and shares its contracts: raw fetch instead of an SDK dependency, the
 * settings live in `meili-settings.ts` as reviewable data, and when
 * MEILISEARCH_HOST is absent everything is a successful no-op so the pipeline
 * stays wired and silent until stage 2 turns it on.
 *
 * TWO INDEXES, ONE SOURCE TABLE. A "coupon" here is a products row whose
 * `type` is 'coupon' or whose `is_coupon_enabled` is set — the same reading as
 * `toProductDocument` and lib/cart/pricing.ts. The products index therefore
 * keeps the WHOLE catalogue (the search page queries one index and must keep
 * finding coupons), and the coupons index holds the coupon subset for surfaces
 * that search only deals. Splitting the rows out of the products index instead
 * would silently break site-wide search.
 */

export const COUPONS_INDEX = process.env.MEILISEARCH_COUPONS_INDEX ?? 'coupons'

/** A coupon document is the coupon subset of the catalogue, same row shape. */
export type CouponDocument = ProductDocument & { type: 'coupon' }

/**
 * The settings shape this service is allowed to send. Typed here rather than
 * `Record<string, unknown>` so a typo'd setting name is a compile error, not a
 * 400 from Meilisearch in the middle of a reindex.
 */
export interface MeiliIndexSettings {
  searchableAttributes?: string[]
  filterableAttributes?: string[]
  sortableAttributes?: string[]
  rankingRules?: string[]
  stopWords?: string[]
  synonyms?: Record<string, string[]>
  typoTolerance?: {
    enabled?: boolean
    minWordSizeForTypos?: { oneTypo?: number; twoTypos?: number }
    disableOnAttributes?: string[]
  }
}

/**
 * Hebrew tokenization config, applied separately from the core settings.
 *
 * `nonSeparatorTokens`: Meilisearch's segmenter treats quotes as word breaks,
 * which shreds Hebrew acronyms and abbreviations — ת"א becomes ת + א, מוצ"ש
 * becomes מוצ + ש. Declaring the gershayim/geresh pair, in both their proper
 * Unicode forms (״ ׳) and the ASCII forms every Israeli keyboard actually
 * produces (" '), keeps them inside the token.
 *
 * `localizedAttributes`: pins every attribute to Hebrew-with-English instead of
 * per-document script detection. The catalogue is bilingual by design
 * (name_he/name_en), so detection is at best redundant and at worst wrong on
 * short all-digit or mixed fields.
 */
export const HEBREW_TOKENIZATION = {
  nonSeparatorTokens: ['"', '״', "'", '׳'],
  localizedAttributes: [{ attributePatterns: ['*'], locales: ['heb', 'eng'] }],
} as const

export interface MeiliTokenizationSettings {
  nonSeparatorTokens?: string[]
  localizedAttributes?: { attributePatterns: string[]; locales: string[] }[]
}

/** Products: exactly the reviewed settings from meili-settings.ts. */
export const PRODUCTS_INDEX_SETTINGS: MeiliIndexSettings = {
  searchableAttributes: [...INDEX_SETTINGS.searchableAttributes],
  filterableAttributes: [...INDEX_SETTINGS.filterableAttributes],
  sortableAttributes: [...INDEX_SETTINGS.sortableAttributes],
  rankingRules: [...INDEX_SETTINGS.rankingRules],
  stopWords: [...INDEX_SETTINGS.stopWords],
  synonyms: INDEX_SETTINGS.synonyms,
  typoTolerance: {
    enabled: INDEX_SETTINGS.typoTolerance.enabled,
    minWordSizeForTypos: { ...INDEX_SETTINGS.typoTolerance.minWordSizeForTypos },
    disableOnAttributes: [...INDEX_SETTINGS.typoTolerance.disableOnAttributes],
  },
}

/**
 * Coupons: the same tuning, minus `type` as a facet (every document is a
 * coupon, the facet would have one value) and with `in_stock:desc` kept —
 * a sold-out deal is exactly as unbuyable as a sold-out product.
 */
export const COUPONS_INDEX_SETTINGS: MeiliIndexSettings = {
  ...PRODUCTS_INDEX_SETTINGS,
  filterableAttributes: (PRODUCTS_INDEX_SETTINGS.filterableAttributes ?? []).filter(
    (attribute) => attribute !== 'type',
  ),
}

function meiliEnv(): { host: string; key: string } | null {
  const host = process.env.MEILISEARCH_HOST
  const key = process.env.MEILISEARCH_API_KEY
  if (!host || !key) return null
  return { host: host.replace(/\/$/, ''), key }
}

async function meiliRequest<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const env = meiliEnv()
  if (!env) throw new Error('meilisearch not configured')
  const res = await fetch(`${env.host}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.key}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`meilisearch ${method} ${path} -> ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as T
}

/**
 * Creates the index if missing and applies the settings.
 *
 * The create is deliberately tolerated when the index already exists
 * (`index_already_exists`), so `reindexAll` is idempotent. The core settings
 * PATCH must succeed — a products index without its filterable attributes
 * breaks every archive facet.
 *
 * The tokenization PATCH is a SEPARATE call allowed to fail soft:
 * `localizedAttributes` needs Meilisearch >= 1.10, and on an older server the
 * whole PATCH would 400. Without it the index still works — the segmenter
 * detects Hebrew script on its own — so a warn log beats failing the entire
 * rebuild over an optimization.
 */
/**
 * `settings` is typed loosely on purpose: the brands and categories settings
 * in meili-settings.ts carry `localizedAttributes`, which the products shape
 * above does not name, and Meilisearch's PATCH accepts any subset.
 */
async function ensureIndex(uid: string, settings: object): Promise<void> {
  const env = meiliEnv()
  if (!env) return
  const res = await fetch(`${env.host}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.key}` },
    body: JSON.stringify({ uid, primaryKey: PRIMARY_KEY }),
    cache: 'no-store',
  })
  if (!res.ok && res.status !== 409) {
    const text = await res.text()
    if (!text.includes('index_already_exists')) {
      throw new Error(`meilisearch create index ${uid} -> ${res.status} ${text}`)
    }
  }

  await meiliRequest(`/indexes/${uid}/settings`, 'PATCH', settings)

  try {
    await meiliRequest(`/indexes/${uid}/settings`, 'PATCH', HEBREW_TOKENIZATION)
  } catch (error) {
    log.warn('search.tokenization_settings_skipped', {
      index: uid,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

const PAGE_SIZE = 500

/**
 * Reads every publicly visible product, page by page. The predicate mirrors
 * the incremental indexer exactly: active and not soft-deleted. Anything else
 * must not be searchable, so it is simply never read.
 */
async function readCatalogue(): Promise<ProductDocument[]> {
  const admin = createAdminClient()

  // Only the public-safe supplier name is indexed, read once for the whole
  // catalogue because the suppliers table is admin-only under RLS (same rule
  // as indexer.ts, without its per-product round trip).
  const supplierNames = new Map<string, string>()
  const { data: suppliers, error: suppliersError } = await admin
    .from('suppliers')
    .select('id, name')
  if (suppliersError) throw new Error(`suppliers read failed: ${suppliersError.message}`)
  for (const supplier of suppliers ?? []) {
    if (supplier.name) supplierNames.set(supplier.id, supplier.name)
  }

  const documents: ProductDocument[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: rows, error } = await admin
      .from('products')
      .select(
        `id, slug, name_he, name_en, brand, short_description_he, description_he, sku,
         type, is_coupon_enabled, kenyon_price, full_price, images,
         stock_quantity, category_id, supplier_id, created_at, categories(name_he, slug)`,
      )
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`products read failed: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      documents.push(
        toProductDocument(
          row,
          row.supplier_id ? (supplierNames.get(row.supplier_id) ?? null) : null,
        ),
      )
    }
    if (rows.length < PAGE_SIZE) break
  }
  return documents
}

export interface ReindexResult {
  skipped: boolean
  products: number
  coupons: number
  /** Brand documents derived from the same catalogue read (STEP 08). */
  brands: number
  /** Category documents, counts from the same catalogue read (STEP 08). */
  categories: number
  /** Meilisearch task uids enqueued for the document batches, in order. */
  taskUids: number[]
}

/**
 * Every document id currently in an index, paged through the documents
 * endpoint with only the primary key projected. Used by the hourly sync to
 * find documents the catalogue no longer contains.
 */
async function listIndexDocumentIds(uid: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await meiliRequest<{ results: { id: string }[]; total: number }>(
      `/indexes/${uid}/documents?fields=${PRIMARY_KEY}&limit=${PAGE_SIZE}&offset=${offset}`,
      'GET',
    )
    for (const doc of page.results ?? []) ids.add(String(doc.id))
    if (!page.results || page.results.length < PAGE_SIZE) break
  }
  return ids
}

export interface SyncResult extends ReindexResult {
  /** Documents deleted because the catalogue no longer lists them. */
  pruned: number
}

/**
 * The hourly sync: `reindexAll` plus the half a PUT-based rebuild cannot do.
 *
 * Upserts only ever add or refresh. A product that was hard-deleted, bulk
 * imported straight past the trigger, or soft-deleted while the webhook
 * endpoint was down stays in the index as a ghost: it ranks, it renders a
 * card, and it 404s on click. `checkSearchDrift` sees the count gap but
 * cannot say which ids; this diff can. Every id in the index that the fresh
 * catalogue read did not produce is deleted in one batch per index.
 *
 * Runs AFTER the upserts are enqueued rather than before, so an index that
 * was empty (first run, or re-created) is filled and never briefly blanked.
 * Meilisearch processes an index's tasks in order, so the delete batch cannot
 * overtake the PUT it follows.
 */
export async function syncCatalogue(): Promise<SyncResult> {
  const reindexed = await reindexAll()
  if (reindexed.skipped) {
    // Same shape as the full path below: the derived id lists are internal
    // to the prune and never part of the result.
    const { brandIds: _b, categoryIds: _c, ...rest } = reindexed
    return { ...rest, pruned: 0 }
  }

  // reindexAll read the catalogue once; reading the id set again here keeps
  // the two functions independent at the cost of one cheap projected query.
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('products')
    .select('id, type, is_coupon_enabled')
    .eq('status', 'active')
    .is('deleted_at', null)
  if (error) throw new Error(`products id read failed: ${error.message}`)
  const catalogueIds = new Set((rows ?? []).map((row) => row.id))
  const couponIds = new Set(
    (rows ?? [])
      .filter((row) => row.type === 'coupon' || row.is_coupon_enabled)
      .map((row) => row.id),
  )
  // The derived indexes are pruned by the ids the rebuild just produced: a
  // brand whose last product left the catalogue, or a category deactivated
  // since the last run, is a ghost by the same rule as a deleted product.
  const brandIds = new Set(reindexed.brandIds)
  const categoryIds = new Set(reindexed.categoryIds)

  let pruned = 0
  const prune = async (uid: string, keep: Set<string>) => {
    const stale = [...(await listIndexDocumentIds(uid))].filter((id) => !keep.has(id))
    if (stale.length === 0) return
    const task = await meiliRequest<{ taskUid: number }>(
      `/indexes/${uid}/documents/delete-batch`,
      'POST',
      stale,
    )
    reindexed.taskUids.push(task.taskUid)
    pruned += stale.length
  }
  await prune(PRODUCTS_INDEX, catalogueIds)
  await prune(COUPONS_INDEX, couponIds)
  await prune(BRANDS_INDEX, brandIds)
  await prune(CATEGORIES_INDEX, categoryIds)

  const { brandIds: _b, categoryIds: _c, ...result } = reindexed
  return { ...result, pruned }
}

/**
 * The active categories, for the categories index. Same columns and the same
 * predicate as the setup script's `loadCategories`.
 */
async function readCategories(): Promise<CategoryRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('categories')
    .select('id, parent_id, slug, name_he, name_en, description_he, image_url, sort_order')
    .eq('is_active', true)
    .is('deleted_at', null)
  if (error) throw new Error(`categories read failed: ${error.message}`)
  return (data ?? []) as CategoryRow[]
}

type CategoryRow = {
  id: string
  parent_id: string | null
  slug: string
  name_he: string
  name_en: string | null
  description_he: string | null
  image_url: string | null
  sort_order: number | null
}

/** `reindexAll` plus the derived ids the sync's prune needs. Internal. */
type ReindexWithIds = ReindexResult & { brandIds: string[]; categoryIds: string[] }

/**
 * Full rebuild of all four indexes from Postgres.
 *
 * Products and coupons are the catalogue and its coupon subset. Brands and
 * categories are DERIVED from the same product documents, in the same run,
 * so a chip's count can never describe a different catalogue than the one
 * indexed (the rule `scripts/setup-meilisearch.mjs` set; this is the same
 * rebuild, now on the hourly cron rather than a script run by hand).
 *
 * Upserts (PUT) rather than swap-and-replace: a document that fell out of the
 * public predicate since the last run is the incremental delete path's job,
 * and a rebuild that briefly empties the index would blank live search for
 * every shopper mid-run. Batches of 500 keep each payload well under
 * Meilisearch's default 95 MB limit whatever the descriptions hold.
 *
 * Failure contract: THROWS on any database or Meilisearch error, so a worker
 * route answers non-2xx and its queue retries. Document additions are async
 * server-side; the returned task uids are the handle for anyone who wants to
 * poll completion, and the counts are what was enqueued, not yet confirmed.
 */
export async function reindexAll(): Promise<ReindexWithIds> {
  if (!meiliEnv()) {
    return {
      skipped: true,
      products: 0,
      coupons: 0,
      brands: 0,
      categories: 0,
      taskUids: [],
      brandIds: [],
      categoryIds: [],
    }
  }

  const documents = await readCatalogue()
  const coupons = documents.filter((doc): doc is CouponDocument => doc.type === 'coupon')
  const brands = toBrandDocuments(documents)
  const categories = toCategoryDocuments(await readCategories(), documents)

  await ensureIndex(PRODUCTS_INDEX, PRODUCTS_INDEX_SETTINGS)
  await ensureIndex(COUPONS_INDEX, COUPONS_INDEX_SETTINGS)
  await ensureIndex(BRANDS_INDEX, BRANDS_INDEX_SETTINGS)
  await ensureIndex(CATEGORIES_INDEX, CATEGORIES_INDEX_SETTINGS)

  const taskUids: number[] = []
  const enqueueBatches = async (uid: string, docs: { id: string }[]) => {
    for (let from = 0; from < docs.length; from += PAGE_SIZE) {
      const task = await meiliRequest<{ taskUid: number }>(
        `/indexes/${uid}/documents?primaryKey=${PRIMARY_KEY}`,
        'PUT',
        docs.slice(from, from + PAGE_SIZE),
      )
      taskUids.push(task.taskUid)
    }
  }

  await enqueueBatches(PRODUCTS_INDEX, documents)
  await enqueueBatches(COUPONS_INDEX, coupons)
  await enqueueBatches(BRANDS_INDEX, brands)
  await enqueueBatches(CATEGORIES_INDEX, categories)

  return {
    skipped: false,
    products: documents.length,
    coupons: coupons.length,
    brands: brands.length,
    categories: categories.length,
    taskUids,
    brandIds: brands.map((doc) => doc.id),
    categoryIds: categories.map((doc) => doc.id),
  }
}
