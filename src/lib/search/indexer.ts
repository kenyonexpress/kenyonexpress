import { deleteDocument, meiliConfigured, upsertDocuments } from '@/lib/search/client'
import { toProductDocument } from '@/lib/search/meili-settings'
import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Executes one search-index job: re-reads the product from Postgres (the
 * webhook payload is never trusted as data) and upserts into or deletes from
 * the Meilisearch index.
 *
 * Failure contract: THROWS on any Meilisearch or database error, so the caller
 * answers non-2xx and the job is retried — by QStash on the webhook path, by
 * the outbox drain on the trigger path (lib/search/outbox.ts). Returns a short
 * outcome string on success (also used by the inline transport in dev).
 *
 * When Meilisearch is not configured (stage 1: Postgres ILIKE serves search)
 * every job is a successful no-op — the pipeline stays wired and silent until
 * MEILISEARCH_HOST appears.
 *
 * The HTTP layer lives in lib/search/client.ts. This module owns WHAT to index;
 * the client owns how to reach the engine.
 */

/**
 * Every column the document needs.
 *
 * `city`, `tags`, `latitude` and `longitude` are here because a facet can only
 * filter on what was indexed: without them every product indexes with no city
 * and the sidebar's city filter returns nothing, for every product, silently.
 * `toProductDocument` reads all four defensively, so a column that is not yet
 * in this database indexes as absent rather than throwing.
 */
const PRODUCT_COLUMNS = `id, slug, name_he, name_en, brand, short_description_he, description_he,
   sku, type, status, deleted_at, is_coupon_enabled, kenyon_price, full_price, images,
   stock_quantity, city, tags, latitude, longitude, category_id, supplier_id, created_at,
   categories(name_he, slug)`

export async function runSearchIndexJob(job: SearchIndexJob): Promise<string> {
  if (!meiliConfigured()) return 'skipped: meilisearch not configured'

  if (job.op === 'delete') {
    await deleteDocument(job.productId)
    return `deleted ${job.productId}`
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', job.productId)
    .maybeSingle()
  if (error) throw new Error(`products read failed: ${error.message}`)

  // The fresh row is the truth. If the product vanished or fell out of the
  // public predicate between enqueue and run, the upsert becomes a delete.
  if (!row || row.deleted_at != null || row.status !== 'active') {
    await deleteDocument(job.productId)
    return `deleted ${job.productId} (stale upsert)`
  }

  // Only the public-safe supplier fields are indexed, read separately because
  // the suppliers table is admin-only under RLS (same rule as the setup
  // script). The city is half of the COALESCE that decides which city a deal
  // shows under; without it a product with no city of its own would index as
  // having none at all, while the catalogue page shows the supplier's.
  let supplierName: string | null = null
  let supplierCity: string | null = null
  if (row.supplier_id) {
    const { data: supplier } = await admin
      .from('suppliers')
      .select('name, city')
      .eq('id', row.supplier_id)
      .maybeSingle()
    supplierName = supplier?.name ?? null
    supplierCity = supplier?.city ?? null
  }

  const document = toProductDocument(row, supplierName, supplierCity)
  await upsertDocuments([document])
  return `upserted ${job.productId}`
}
