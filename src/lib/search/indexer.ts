import { PRODUCTS_INDEX, toProductDocument } from '@/lib/search/meili-settings'
import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Executes one search-index job: re-reads the product from Postgres (the
 * webhook payload is never trusted as data) and upserts into or deletes from
 * the Meilisearch index.
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

export async function runSearchIndexJob(job: SearchIndexJob): Promise<string> {
  if (!meiliEnv()) return 'skipped: meilisearch not configured'

  if (job.op === 'delete') {
    await meiliRequest(`/indexes/${PRODUCTS_INDEX}/documents/${job.productId}`, 'DELETE')
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
    await meiliRequest(`/indexes/${PRODUCTS_INDEX}/documents/${job.productId}`, 'DELETE')
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
  return `upserted ${job.productId}`
}
