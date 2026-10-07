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
 * after that: a sequence that could not answer, a render that threw, a
 * database write that raced. Since STEP 42 the platform issues its own
 * numbered PDF and the provider's document is only a reference, so a missing
 * Cardcom credential no longer holds the queue; it only costs the document
 * its clearing-side twin.
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
  let emailed = 0
  let failed = 0
  let dead = 0

  for (const row of rows) {
    const outcome = await issueInvoice(admin, row)
    if (outcome.ok) {
      issued++
      if (outcome.emailed) emailed++
    } else if (outcome.dead) dead++
    else failed++
  }

  return NextResponse.json({ ok: true, considered: rows.length, issued, emailed, failed, dead })
}

export const GET = withRequestLog('/api/cron/invoices', handleGET)
