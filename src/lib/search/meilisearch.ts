import { log } from '@/lib/observability/log'
import {
  INDEX_SETTINGS,
  PRIMARY_KEY,
  PRODUCTS_INDEX,
  type ProductDocument,
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
async function ensureIndex(uid: string, settings: MeiliIndexSettings): Promise<void> {
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
  /** Meilisearch task uids enqueued for the document batches, in order. */
  taskUids: number[]
}

/**
 * Full rebuild of both indexes from Postgres.
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
export async function reindexAll(): Promise<ReindexResult> {
  if (!meiliEnv()) {
    return { skipped: true, products: 0, coupons: 0, taskUids: [] }
  }

  const documents = await readCatalogue()
  const coupons = documents.filter((doc): doc is CouponDocument => doc.type === 'coupon')

  await ensureIndex(PRODUCTS_INDEX, PRODUCTS_INDEX_SETTINGS)
  await ensureIndex(COUPONS_INDEX, COUPONS_INDEX_SETTINGS)

  const taskUids: number[] = []
  const enqueueBatches = async (uid: string, docs: ProductDocument[]) => {
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

  return { skipped: false, products: documents.length, coupons: coupons.length, taskUids }
}
