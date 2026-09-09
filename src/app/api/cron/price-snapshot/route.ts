import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { israeliDay } from '@/lib/pricing/price-history'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * One row per product per day: what it cost, and what it claimed it used to
 * cost.
 *
 * WHY A DAILY SNAPSHOT AND NOT A TRIGGER ON PRICE CHANGE
 *
 * Because the question the law asks is about days, not about edits. "The lowest
 * price in the previous 30 days" needs the price on all thirty of them,
 * including the twenty-nine when nobody touched anything. `audit_log` is the
 * change-driven version of this and the numbers show what it buys: 555 product
 * rows in production, 21 of which mention `kenyon_price`, covering 20 products
 * -- and not one of the 15 products currently showing a struck-through price.
 *
 * A change trigger would also record only what went through the audited path.
 * A bulk price update, a direct SQL edit, or an import writes no audit row and
 * leaves a hole exactly where a dispute would land. A snapshot sees the price,
 * however it got there.
 *
 * IT WRITES EVERY NON-DELETED PRODUCT, NOT ONLY THE ACTIVE ONES
 *
 * The `status` goes in the row and the READER filters on it. Recording only
 * active products would make a draft day indistinguishable from a day the cron
 * did not run, and those are opposite facts: the first means "not on sale", the
 * second means "we do not know". Writing the status keeps them apart, and it
 * is what stops a product being hidden for a month and coming back with any
 * "before" price it likes behind a full window of draft days.
 *
 * IDEMPOTENT BY INDEX, NOT BY GUARD
 *
 * `price_history_observation_once` covers the whole observation, so running
 * this twice in a day writes nothing the second time and a genuine mid-day
 * price change writes a second row. No "have I run today" check, which is the
 * kind of guard that skips a day after a retry.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, same as the
 * other thirteen jobs. See docs/CRON-EXTERNAL.md.
 */

/** Products per insert. The catalogue is 80 rows; this is headroom, not tuning. */
const BATCH = 500

type ProductRow = {
  id: string
  kenyon_price_agorot: number | null
  full_price_agorot: number | null
  status: string
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const observedOn = israeliDay()

  const { data, error } = await admin
    .from('products')
    .select('id, kenyon_price_agorot, full_price_agorot, status')
    .is('deleted_at', null)

  if (error) {
    log.error('price_snapshot.products_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = ((data ?? []) as unknown as ProductRow[])
    // A product with no price has nothing to observe. Skipped rather than
    // written as zero: a zero would be indistinguishable from a free product
    // and would drag the 30-day minimum to nothing, which is the one value that
    // makes every claim above it a violation.
    .filter((p) => p.kenyon_price_agorot !== null)
    .map((p) => ({
      product_id: p.id,
      observed_on: observedOn,
      price_agorot: p.kenyon_price_agorot,
      reference_agorot: p.full_price_agorot,
      status: p.status,
      source: 'snapshot',
    }))

  let written = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    // `ignoreDuplicates` compiles to ON CONFLICT DO NOTHING, which is what makes
    // a re-run a no-op against `price_history_observation_once`.
    const { error: insertError, count } = await admin
      .from('price_history')
      .upsert(slice, { ignoreDuplicates: true, count: 'exact' })

    if (insertError) {
      // The table is not there yet: 193 is written and unapplied. Reported as a
      // warning and a 200, because a scheduler that sees a 500 every night for
      // a migration nobody has approved teaches everyone to ignore this job.
      const missing = insertError.code === '42P01' || insertError.code === 'PGRST205'
      log[missing ? 'warn' : 'error']('price_snapshot.write_failed', {
        reason: insertError.message,
        observed_on: observedOn,
      })
      return NextResponse.json(
        { ok: missing, written, skipped: rows.length - written, reason: insertError.message },
        { status: missing ? 200 : 500 },
      )
    }
    written += count ?? slice.length
  }

  log.info('price_snapshot.done', {
    observed_on: observedOn,
    products: rows.length,
    written,
  })

  return NextResponse.json({ ok: true, observed_on: observedOn, products: rows.length, written })
}

export const GET = withRequestLog(
  '/api/cron/price-snapshot',
  withJobRun('price-snapshot', handleGET),
)
