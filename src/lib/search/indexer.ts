import {
  BRANDS_INDEX,
  CATEGORIES_INDEX,
  PRODUCTS_INDEX,
  brandDocumentId,
  toBrandDocuments,
  toCategoryDocuments,
  toProductDocument,
} from '@/lib/search/meili-settings'
import { COUPONS_INDEX } from '@/lib/search/meilisearch'
import {
  type AnyIndexJob,
  type CategoryIndexJob,
  type SearchIndexJob,
  isCategoryIndexJob,
} from '@/lib/search/pipeline-contracts'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Executes one search-index job: re-reads the row from Postgres (the webhook
 * payload is never trusted as data) and upserts into or deletes from the
 * Meilisearch indexes.
 *
 * FOUR INDEXES, ONE EXECUTOR (STEP 08, 30.09). Until this step a product
 * change reached the products index and nothing else: the coupons index was
 * refreshed only by the hourly sync, and the brands and categories indexes
 * were written by `scripts/setup-meilisearch.mjs` alone, so a renamed
 * category or a brand's first product stayed wrong in autocomplete until
 * someone ran a script by hand. Now:
 *
 *   product upsert   PUT products; PUT coupons if the document is a coupon,
 *                    else DELETE it from coupons (a product that stopped being
 *                    a coupon); then refresh the brand document and the
 *                    category document the fresh row points at.
 *   product delete   DELETE from products and coupons. The row is gone, so
 *                    its old brand and category cannot be read here; the
 *                    hourly `syncCatalogue` rebuilds and prunes both derived
 *                    indexes, which is the same bound a hard delete already
 *                    had for the products index before the outbox.
 *   category job     re-read the category, recount its active products, PUT
 *                    the document or DELETE it when the row is hidden.
 *
 * A product whose brand or category CHANGED leaves its previous brand or
 * category document one product too high until the hourly sync. Measured
 * against the alternative (carrying the old values in the job, which the
 * outbox trigger cannot supply) that is the honest bound, and it is written
 * down here rather than smoothed over.
 *
 * Failure contract: THROWS on any Meilisearch or database error, so the worker
 * route answers non-2xx and QStash retries with backoff. Returns a short
 * outcome string on success (also used by the inline transport in dev).
 *
 * When Meilisearch is not configured (stage 1: Postgres ILIKE serves search)
 * every job is a successful no-op — the pipeline stays wired and silent until
 * MEILISEARCH_HOST appears.
 */

function meiliEnv(): { host: string; key: string } | null {
  const host = process.env.MEILISEARCH_HOST
  const key = process.env.MEILISEARCH_API_KEY
  if (!host || !key) return null
  return { host: host.replace(/\/$/, ''), key }
}

/**
 * Whether Meilisearch is configured at all. The outbox drain checks this
 * BEFORE claiming: while stage 1 (Postgres ILIKE/FTS) serves search, the
 * outbox rows are the durable record that a reindex is owed, and claiming
 * them only to no-op would burn their attempt counters and blur the record.
 */
export function isMeilisearchConfigured(): boolean {
  return meiliEnv() !== null
}

async function meiliRequest(path: string, method: string, body?: unknown): Promise<void> {
  const env = meiliEnv()
  if (!env) return
  const res = await fetch(`${env.host}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.key}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  // 404 on delete = already gone; deletes must be idempotent.
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new Error(`meilisearch ${method} ${path} -> ${res.status} ${await res.text()}`)
  }
}

/** The public predicate, applied to every catalogue read this module makes. */
const ACTIVE = { status: 'active' } as const

/**
 * The document type the products facet carries: a row flagged coupon-enabled
 * IS a coupon whatever its `type` column says (mirrors toProductDocument).
 */
function resolvedType(row: { type?: string | null; is_coupon_enabled?: boolean | null }): string {
  return row.type === 'coupon' || row.is_coupon_enabled ? 'coupon' : (row.type ?? 'physical')
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

/**
 * Rewrites ONE brand document from the active catalogue, or deletes it when
 * the brand no longer has an active product.
 *
 * Reads the whole active catalogue's brand column rather than filtering on
 * the name: `toBrandDocuments` groups case- and whitespace-insensitively, and
 * PostgREST has no filter that agrees with that rule. The projection is four
 * columns over a catalogue of eighty rows; if the catalogue ever grows to
 * where that read is the expensive part of a job, the hourly sync already
 * rebuilds this index and this refresh can be dropped without losing a
 * document, only freshness.
 */
async function refreshBrandDocument(
  admin: ReturnType<typeof createAdminClient>,
  brandName: string,
): Promise<string> {
  const { data, error } = await admin
    .from('products')
    .select('brand, type, is_coupon_enabled, categories(slug)')
    .eq('status', ACTIVE.status)
    .is('deleted_at', null)
  if (error) throw new Error(`brand read failed: ${error.message}`)

  const rows = (data ?? []).map((row) => ({
    brand: row.brand,
    type: resolvedType(row),
    category_slug: firstJoined(row.categories)?.slug ?? null,
  }))
  const id = brandDocumentId(brandName.trim().toLowerCase().replace(/\s+/g, ' '))
  const document = toBrandDocuments(rows).find((doc) => doc.id === id)

  if (!document) {
    await meiliRequest(`/indexes/${BRANDS_INDEX}/documents/${id}`, 'DELETE')
    return `brand ${id} deleted`
  }
  await meiliRequest(`/indexes/${BRANDS_INDEX}/documents`, 'PUT', [document])
  return `brand ${id} upserted`
}

const CATEGORY_COLUMNS =
  'id, slug, name_he, name_en, description_he, parent_id, image_url, sort_order, is_active, deleted_at'

/**
 * Rewrites ONE category document with fresh counts, or deletes it when the
 * category is hidden or gone. Shared by the product path (the category the
 * fresh row points at) and the category path (the job's own id).
 */
async function refreshCategoryDocument(
  admin: ReturnType<typeof createAdminClient>,
  categoryId: string,
): Promise<string> {
  const { data: category, error } = await admin
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .eq('id', categoryId)
    .maybeSingle()
  if (error) throw new Error(`categories read failed: ${error.message}`)

  if (!category || category.deleted_at != null || category.is_active === false) {
    await meiliRequest(`/indexes/${CATEGORIES_INDEX}/documents/${categoryId}`, 'DELETE')
    return `category ${categoryId} deleted`
  }

  const { data: products, error: productsError } = await admin
    .from('products')
    .select('category_id, type, is_coupon_enabled')
    .eq('status', ACTIVE.status)
    .is('deleted_at', null)
    .eq('category_id', categoryId)
  if (productsError) throw new Error(`category products read failed: ${productsError.message}`)

  const [document] = toCategoryDocuments(
    [category],
    (products ?? []).map((row) => ({ category_id: row.category_id, type: resolvedType(row) })),
  )
  if (!document) {
    // toCategoryDocuments applies the same visibility rule; unreachable after
    // the check above, kept so the two rules can never disagree silently.
    await meiliRequest(`/indexes/${CATEGORIES_INDEX}/documents/${categoryId}`, 'DELETE')
    return `category ${categoryId} deleted`
  }
  await meiliRequest(`/indexes/${CATEGORIES_INDEX}/documents`, 'PUT', [document])
  return `category ${categoryId} upserted`
}

async function runCategoryJob(job: CategoryIndexJob): Promise<string> {
  if (job.op === 'delete') {
    await meiliRequest(`/indexes/${CATEGORIES_INDEX}/documents/${job.categoryId}`, 'DELETE')
    return `deleted category ${job.categoryId}`
  }
  const admin = createAdminClient()
  return refreshCategoryDocument(admin, job.categoryId)
}

async function deleteProductEverywhere(productId: string): Promise<void> {
  await meiliRequest(`/indexes/${PRODUCTS_INDEX}/documents/${productId}`, 'DELETE')
  await meiliRequest(`/indexes/${COUPONS_INDEX}/documents/${productId}`, 'DELETE')
}

async function runProductJob(job: SearchIndexJob): Promise<string> {
  if (job.op === 'delete') {
    await deleteProductEverywhere(job.productId)
    return `deleted ${job.productId}`
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('products')
    .select(
      `id, slug, name_he, name_en, brand, short_description_he, description_he, sku,
       type, status, deleted_at, is_coupon_enabled, kenyon_price, full_price, images,
       stock_quantity, category_id, supplier_id, created_at, categories(name_he, slug)`,
    )
    .eq('id', job.productId)
    .maybeSingle()
  if (error) throw new Error(`products read failed: ${error.message}`)

  // The fresh row is the truth. If the product vanished or fell out of the
  // public predicate between enqueue and run, the upsert becomes a delete.
  if (!row || row.deleted_at != null || row.status !== 'active') {
    await deleteProductEverywhere(job.productId)
    return `deleted ${job.productId} (stale upsert)`
  }

  // Only the public-safe supplier name is indexed, read separately because the
  // suppliers table is admin-only under RLS (same rule as the setup script).
  let supplierName: string | null = null
  if (row.supplier_id) {
    const { data: supplier } = await admin
      .from('suppliers')
      .select('name')
      .eq('id', row.supplier_id)
      .maybeSingle()
    supplierName = supplier?.name ?? null
  }

  const document = toProductDocument(row, supplierName)
  await meiliRequest(`/indexes/${PRODUCTS_INDEX}/documents`, 'PUT', [document])

  // The coupons index is the coupon SUBSET of the same documents. A product
  // that is a coupon is upserted there too; one that is not is deleted from
  // there, which is a no-op (404) for the common case and the fix for a
  // product whose coupon flag was just cleared.
  if (document.type === 'coupon') {
    await meiliRequest(`/indexes/${COUPONS_INDEX}/documents`, 'PUT', [document])
  } else {
    await meiliRequest(`/indexes/${COUPONS_INDEX}/documents/${job.productId}`, 'DELETE')
  }

  const derived: string[] = []
  if (document.brand) derived.push(await refreshBrandDocument(admin, document.brand))
  if (document.category_id) derived.push(await refreshCategoryDocument(admin, document.category_id))

  return derived.length
    ? `upserted ${job.productId}; ${derived.join('; ')}`
    : `upserted ${job.productId}`
}

export async function runSearchIndexJob(job: AnyIndexJob): Promise<string> {
  if (!meiliEnv()) return 'skipped: meilisearch not configured'
  return isCategoryIndexJob(job) ? runCategoryJob(job) : runProductJob(job)
}
