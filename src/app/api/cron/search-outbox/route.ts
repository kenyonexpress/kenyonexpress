import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { isMeilisearchConfigured, runSearchIndexJob } from '@/lib/search/indexer'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainSearchOutbox } from '@/server/search/outbox-drain'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The drain the search-index outbox never had.
 *
 * Migration 132 put an AFTER trigger on `public.products` that records every
 * write as a row in `search_index_outbox` — the durable floor under the
 * webhook -> QStash fast path. The trigger has been live in production since
 * the migration was applied and had written 21 rows by 2026-09-09; nothing
 * ever claimed them, so the floor held the record and nobody read it. This
 * route reads it: claim a batch, run one index job per product (the worker
 * re-reads the row from Postgres, so a stale upsert converges to a delete),
 * stamp done or schedule a retry with backoff.
 *
 * While Meilisearch is not configured (stage 1: Postgres search) the sweep
 * deliberately does NOT claim: the rows are the record that a reindex is owed
 * once stage 2 arrives, and claiming them to no-op would burn their attempt
 * counters for nothing. The queue is bounded by edit volume, not time.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, same as the
 * other twelve.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!isMeilisearchConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'meilisearch not configured' })
  }

  const summary = await drainSearchOutbox(createAdminClient(), runSearchIndexJob)

  if (summary.failed > 0 || summary.errors.length > 0) {
    // Loud: every failed job here is a product whose search result is stale,
    // and a rising count means the index and the catalogue are drifting apart.
    log.error('search.outbox_drain_failed_jobs', {
      claimed: summary.claimed,
      failed: summary.failed,
      errors: summary.errors.slice(0, 10),
    })
  } else if (summary.claimed > 0) {
    // Journalled only when the sweep found work: an empty outbox every ten
    // minutes is the normal state and not an event.
    log.info('search.outbox_drained', { claimed: summary.claimed, succeeded: summary.succeeded })
  }

  return NextResponse.json({ ok: summary.failed === 0, ...summary })
}

export const GET = withRequestLog('/api/cron/search-outbox', handleGET)
