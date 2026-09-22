import { ingestCandidates } from '@/lib/deals-autopilot/ingest'
import { parseCsvFeed, parseJsonFeed } from '@/lib/deals-autopilot/parse'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/server/resilience/flags'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Every six hours: fetch each opted-in supplier's OWN deals feed, parse it,
 * and queue whatever validates as a `deal_candidates` row for admin review.
 *
 * NOT A SCRAPER. This route never constructs a URL itself and never reaches
 * a site a supplier did not explicitly configure in their own console
 * (`suppliers.feed_url`, https only, enforced by migration 237's CHECK).
 * "Israeli sources only" in the original brief is satisfied by construction:
 * every source is one of this platform's own suppliers.
 *
 * FETCH TIMEOUT PER SUPPLIER, NOT PER RUN. One unreachable or slow feed must
 * not starve every other supplier's slot in a six-hour cycle -- a single
 * `AbortSignal.timeout` per fetch, and a failure there is logged and skipped,
 * not a reason to fail the whole run.
 *
 * NO PUBLISH HAPPENS HERE. This route only ever writes 'pending_review' rows
 * (see ingestCandidates -- it will not touch a row an admin already decided
 * on, and nothing here can create a public.products row at all). Nothing a
 * supplier's feed says reaches a shopper without an admin's approval, which
 * is also why this route needs no cache invalidation: nothing it writes is
 * read by the storefront.
 */

const FETCH_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 2_000_000

type SupplierRow = { id: string; name: string; feed_url: string; feed_format: string | null }

async function fetchFeedText(url: string): Promise<{ text: string } | { error: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const text = await res.text()
    if (text.length > MAX_BODY_BYTES) return { error: `feed body too large (${text.length} bytes)` }
    return { text }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' }
  }
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!(await isFeatureEnabled('DEALS_AUTOPILOT'))) {
    return NextResponse.json({ ok: true, skipped: 'DEALS_AUTOPILOT disabled' })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('suppliers' as never)
    .select('id, name, feed_url, feed_format')
    .not('feed_url', 'is', null)
    .eq('status', 'active')

  if (error) {
    log.error('deals_autopilot.suppliers_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'suppliers read failed' }, { status: 500 })
  }

  const suppliers = (data ?? []) as unknown as SupplierRow[]
  const results: Array<{
    supplierId: string
    ok: boolean
    inserted?: number
    updated?: number
    skippedDecided?: number
    failed?: number
    rejected?: number
    error?: string
  }> = []

  for (const supplier of suppliers) {
    const fetched = await fetchFeedText(supplier.feed_url)
    if ('error' in fetched) {
      log.warn('deals_autopilot.fetch_failed', { supplierId: supplier.id, reason: fetched.error })
      results.push({ supplierId: supplier.id, ok: false, error: fetched.error })
      continue
    }

    const parsed =
      supplier.feed_format === 'csv' ? parseCsvFeed(fetched.text) : parseJsonFeed(fetched.text)

    if (parsed.rejected.length > 0) {
      log.warn('deals_autopilot.rows_rejected', {
        supplierId: supplier.id,
        rejected: parsed.rejected.length,
        sample: parsed.rejected.slice(0, 3),
      })
    }

    const outcome = await ingestCandidates(supplier.id, parsed.candidates)
    results.push({
      supplierId: supplier.id,
      ok: true,
      rejected: parsed.rejected.length,
      ...outcome,
    })
  }

  log.info('deals_autopilot.run_done', { suppliers: suppliers.length })
  return NextResponse.json({ ok: true, suppliers: suppliers.length, results })
}

export const GET = withRequestLog(
  '/api/cron/deals-autopilot',
  withJobRun('deals-autopilot', handleGET),
)
