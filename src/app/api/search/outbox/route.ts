import { withRequestLog } from '@/lib/observability/with-request-log'
import { meiliConfigured } from '@/lib/search/client'
import { OUTBOX_BATCH_SIZE, drainSearchOutbox } from '@/lib/search/outbox'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Drains the search outbox: claims pending product changes and writes them to
 * Meilisearch. See lib/search/outbox.ts for why the outbox exists at all, and
 * migrations/pending/087_search_outbox.sql for the table and its RPCs.
 *
 * AUTH IS `Authorization: Bearer CRON_SECRET`, the convention every cron route
 * in this app already uses, compared in constant time. The route reaches the
 * database with the service key and writes the search index; it is not
 * something a caller may reach by guessing a URL.
 *
 * NO SECRET MEANS CLOSED, NOT OPEN. `bearerMatches(header, '')` is false, so a
 * deployment that forgot CRON_SECRET answers 401 to everything rather than
 * exposing the drain.
 *
 * GET AND POST BOTH WORK, and they are the same handler: Vercel Cron issues a
 * GET, while a manual replay or a pg_cron/pg_net call from the database is
 * naturally a POST. Draining is idempotent - the worker re-reads each row and
 * writes what it says - so nothing turns on the method.
 *
 * IT ANSWERS 200 ON A PARTIAL FAILURE. A batch where three of twenty-five
 * products failed is a batch that indexed twenty-two, and those three are still
 * pending in the table with their error recorded. Answering non-2xx would tell
 * the scheduler the whole run failed, which is both untrue and, on a retrying
 * scheduler, a way to re-index the twenty-two forever.
 */

const MAX_LIMIT = 200

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // Nothing to drain into. The rows stay pending, which is correct: they are
  // changes the index has not received, and the index does not exist yet.
  if (!meiliConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'meilisearch not configured' })
  }

  const requested = Number(new URL(request.url).searchParams.get('limit'))
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.trunc(requested), MAX_LIMIT)
      : OUTBOX_BATCH_SIZE

  try {
    const result = await drainSearchOutbox({ limit })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    // Claiming itself failed, so NOTHING was claimed and nothing is in flight.
    // This one is a real 500: the scheduler should retry it.
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    )
  }
}

export const GET = withRequestLog('/api/search/outbox', handle)
export const POST = withRequestLog('/api/search/outbox', handle)
