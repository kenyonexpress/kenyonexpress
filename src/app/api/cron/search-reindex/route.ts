import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { checkSearchDrift } from '@/lib/search/drift'
import { isMeilisearchConfigured } from '@/lib/search/indexer'
import { syncCatalogue } from '@/lib/search/meilisearch'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The hourly full sync of the Meilisearch indexes from Postgres.
 *
 * The other two transports are incremental: the products webhook and the
 * outbox drain each move ONE product's change into the index, and both are
 * only as good as the trigger that recorded it. Three things bypass that
 * trigger entirely -- a bulk import, a restored backup, an index wiped and
 * re-created -- and `checkSearchDrift` in the health probe can count the
 * resulting gap but not close it. This route closes it: every active,
 * undeleted product is upserted (a refresh of what is already right, a repair
 * of what is stale) and every document the catalogue no longer contains is
 * deleted, so an hour is the longest a ghost or a missing product can live.
 *
 * Hourly rather than every ten minutes because the sweep reads the whole
 * catalogue and rewrites it; on a catalogue of eighty that is one request,
 * on a catalogue of eight thousand it is sixteen, and neither needs to happen
 * six times an hour when the incremental paths carry the normal case.
 *
 * While Meilisearch is unconfigured (stage 1: Postgres search) the route
 * answers ok and does nothing, like `search-outbox`.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, same as the
 * other twenty.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!isMeilisearchConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'meilisearch not configured' })
  }

  const started = Date.now()
  try {
    const sync = await syncCatalogue()
    // Drift is measured AFTER the sync's tasks are enqueued, not applied:
    // Meilisearch indexes asynchronously, so a non-zero gap here on a large
    // catalogue can be the queue still working. The health probe re-measures
    // every five minutes; a gap that survives two of those is real.
    const drift = await checkSearchDrift(createAdminClient())
    const ms = Date.now() - started
    if (sync.pruned > 0 || drift.status === 'drift') {
      log.warn('search.reindex_repaired', {
        products: sync.products,
        coupons: sync.coupons,
        pruned: sync.pruned,
        drift: drift.status,
        ms,
      })
    } else {
      log.info('search.reindex_complete', { products: sync.products, coupons: sync.coupons, ms })
    }
    return NextResponse.json({ ok: true, ...sync, drift, ms })
  } catch (error) {
    // Loud: a sync that fails every hour is an index that will slowly stop
    // matching the catalogue, and nothing else re-reads the whole thing.
    const reason = error instanceof Error ? error.message : 'unknown'
    log.error('search.reindex_failed', { reason, ms: Date.now() - started })
    return NextResponse.json({ ok: false, error: 'reindex_failed' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/cron/search-reindex', handleGET)
