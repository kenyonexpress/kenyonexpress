import 'server-only'

import { PRODUCTS_INDEX } from '@/lib/search/meili-settings'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Drift: is the search index the size the catalogue says it should be?
 *
 * The pipeline has two transports (webhook + outbox floor) and both can be
 * healthy while the INDEX is still wrong -- a bulk import that bypassed the
 * trigger, an index wiped and re-created, a filter predicate that changed.
 * Counting is the cheap invariant: the number of active, undeleted products
 * must equal the number of documents. It cannot prove the documents are
 * RIGHT, only that none are missing or stale-extra, which is precisely the
 * failure the transports cannot see.
 */

export type SearchDrift =
  | { status: 'skipped'; reason: string }
  | { status: 'ok'; dbCount: number; indexCount: number }
  | { status: 'drift'; dbCount: number; indexCount: number; gap: number }

export async function checkSearchDrift(admin: SupabaseClient): Promise<SearchDrift> {
  const host = process.env.MEILISEARCH_HOST
  const key = process.env.MEILISEARCH_API_KEY
  if (!host || !key) return { status: 'skipped', reason: 'meilisearch not configured' }

  const { count, error } = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('deleted_at', null)
  if (error) return { status: 'skipped', reason: `db count failed: ${error.message}` }

  const res = await fetch(`${host.replace(/\/$/, '')}/indexes/${PRODUCTS_INDEX}/stats`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(4000),
    cache: 'no-store',
  }).catch((err: unknown) => {
    return { ok: false as const, status: 0, err: err instanceof Error ? err.message : 'unknown' }
  })
  if (!('json' in res) || !res.ok) {
    const detail = 'err' in res ? res.err : `status ${res.status}`
    return { status: 'skipped', reason: `index stats failed: ${detail}` }
  }

  const stats = (await res.json()) as { numberOfDocuments?: number }
  const indexCount = stats.numberOfDocuments ?? 0
  const dbCount = count ?? 0

  if (dbCount === indexCount) return { status: 'ok', dbCount, indexCount }
  return { status: 'drift', dbCount, indexCount, gap: indexCount - dbCount }
}
