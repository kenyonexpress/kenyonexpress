import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueInvoice, loadDueInvoices } from '@/server/payments/invoices'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Retries tax documents that were queued by the money path and not issued.
 *
 * The queue is filled by `finalizeOrder` (the sale's invoice/receipt) and by
 * the refund action (the credit note), and each row is attempted once the
 * moment it is written. This route exists for everything that can go wrong
 * after that: a provider outage, a network blip, and above all the state this
 * project is actually in - Cardcom credentials are a GO/NO-GO item and are not
 * set yet, so every document queued before they land is waiting here.
 *
 * A run that finds the provider unconfigured changes NOTHING: no attempt is
 * counted and no backoff is applied, so the queue does not eat itself while
 * waiting for a key. Same distinction the notification outbox draws.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** One run's ceiling. A backlog drains over consecutive runs. */
const BATCH = 25

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  let rows: Awaited<ReturnType<typeof loadDueInvoices>>
  try {
    rows = await loadDueInvoices(admin, BATCH)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.error('invoices.queue_read_failed', { reason })
    return NextResponse.json({ ok: false, error: reason }, { status: 500 })
  }

  let issued = 0
  let failed = 0
  let dead = 0
  let skipped = 0

  for (const row of rows) {
    const outcome = await issueInvoice(admin, row)
    if (outcome.ok) issued++
    else if ('skipped' in outcome && outcome.skipped) skipped++
    else if (outcome.dead) dead++
    else failed++
  }

  return NextResponse.json({ ok: true, considered: rows.length, issued, skipped, failed, dead })
}

export const GET = withRequestLog('/api/cron/invoices', handleGET)
