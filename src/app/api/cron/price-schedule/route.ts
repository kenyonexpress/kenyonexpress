import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { israeliDay } from '@/lib/pricing/price-history'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Flash deals: the scheduled price changes whose moment has come.
 *
 * A DUE ROW IN THE PAST IS STILL DUE. The query is `effective_at <= now()`, not
 * a window, so a run that was missed catches up rather than skipping. A flash
 * deal nobody ran is a promise on a marketing email that the site did not keep,
 * and the customer arriving to find the old price does not know a cron failed.
 *
 * EVERY APPLIED CHANGE WRITES `price_history` WITH `source = 'change'`, and
 * that is this route's entire duty to pricing compliance. 193 created that
 * column for exactly this and left it unused; until now the record was one
 * observation a day at 04:00, so a flash deal that opened at 10:00 and closed
 * at 18:00 left no trace at all — and the thirty-day "lowest price charged"
 * that Israeli law asks about would have been computed from a window that never
 * saw it.
 *
 * WHAT THIS ROUTE DELIBERATELY DOES NOT DO is refuse a change on compliance
 * grounds. Israeli law constrains the "before" price, not the price; lowering
 * is always lawful. What a flash deal changes is the EVIDENCE — after a day at
 * ₪99 a `full_price` of ₪150 stops being defensible for thirty days — and
 * `checkReferencePrice` works that out on its own from the rows written here,
 * with the storefront dropping the strike-through and nobody deciding anything.
 * A second refusal here would be a second opinion about the same rule.
 *
 * THE CACHE IS INVALIDATED OR THE DEAL IS INVISIBLE. `loadProductBySlug` and
 * the grids are cached for an hour under `CATALOGUE_TAG`; a two-hour flash deal
 * that did not invalidate would be live for the half of its window nobody could
 * see.
 *
 * `revalidateTag` and NOT `updateTag`, and the difference is worth stating
 * because it is a real one: `updateTag` expires an entry immediately and is
 * callable only from a Server Action, which this is not. `revalidateTag(tag,
 * profile)` marks the tag stale under the named profile, so the next request
 * refills. A flash deal is therefore visible from the first request after the
 * cron rather than from the instant of the change — seconds, not the hour it
 * would otherwise be, and the honest description of what happens.
 *
 * The profile is `'hours'`, matching the `cacheLife('hours')` these entries
 * were created with. A different profile here would describe a staleness the
 * entries were never built for.
 */

/** One run's ceiling. A backlog drains over consecutive runs. */
const BATCH = 100

const MISSING = new Set(['42P01', 'PGRST205'])

type DueRow = {
  id: string
  product_id: string
  price_agorot: number
  reference_agorot: number | null
}

/**
 * Agorot to the `numeric(_, 2)` shekels the legacy columns hold.
 *
 * A STRING, not a number. `products.kenyon_price` is numeric and its `_agorot`
 * twin is GENERATED, so it cannot be written directly and the shekel column is
 * the only way in. `toFixed(2)` over an integer count of agorot is exact for
 * every value this catalogue can hold, and it hands PostgREST a decimal string
 * that Postgres parses as numeric — whereas a JavaScript number would be
 * serialised through a float and is the one thing CLAUDE.md forbids on the
 * money path.
 */
function agorotToNumericString(agorot: number): string {
  return (agorot / 100).toFixed(2)
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('scheduled_price_changes' as never)
    .select('id, product_id, price_agorot, reference_agorot')
    .is('applied_at', null)
    .is('cancelled_at', null)
    .lte('effective_at', new Date().toISOString())
    .order('effective_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    if (MISSING.has(error.code ?? '')) {
      log.warn('price_schedule.table_absent', {
        detail: '201 is written and not applied; nothing is scheduled.',
      })
      return NextResponse.json({ ok: true, applied: 0, skipped: '201 not applied' })
    }
    log.error('price_schedule.read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as DueRow[]
  const observedOn = israeliDay()
  let applied = 0
  let failed = 0

  for (const row of rows) {
    const patch: Record<string, string> = {
      kenyon_price: agorotToNumericString(row.price_agorot),
    }
    // Only when the row asked for it. A schedule that always wrote both would
    // clear a struck-through price every time somebody scheduled a plain change.
    if (row.reference_agorot !== null) {
      patch.full_price = agorotToNumericString(row.reference_agorot)
    }

    const { data: updated, error: updateError } = await admin
      .from('products')
      .update(patch as never)
      .eq('id', row.product_id)
      .select('id, status')
      .maybeSingle()

    if (updateError || !updated) {
      // Recorded on the row and left unapplied, so the next run retries it. A
      // failure that marked itself applied would drop the deal silently.
      failed++
      await admin
        .from('scheduled_price_changes' as never)
        .update({
          last_error: (updateError?.message ?? 'product not found').slice(0, 500),
        } as never)
        .eq('id', row.id)
      log.error('price_schedule.apply_failed', {
        changeId: row.id,
        productId: row.product_id,
        reason: updateError?.message ?? 'product not found',
      })
      continue
    }

    // The observation, written HERE rather than left to the 04:00 snapshot.
    // Best effort: the price has already moved, and failing to record it must
    // not make the route retry a change that has been applied.
    const { error: historyError } = await admin.from('price_history' as never).upsert(
      {
        product_id: row.product_id,
        observed_on: observedOn,
        price_agorot: row.price_agorot,
        reference_agorot: row.reference_agorot,
        status: (updated as { status: string }).status,
        source: 'change',
      } as never,
      { ignoreDuplicates: true },
    )
    if (historyError && !MISSING.has(historyError.code ?? '')) {
      log.warn('price_schedule.history_write_failed', {
        changeId: row.id,
        reason: historyError.message,
      })
    }

    await admin
      .from('scheduled_price_changes' as never)
      .update({ applied_at: new Date().toISOString(), last_error: null } as never)
      .eq('id', row.id)

    applied++
  }

  // Once, after the batch, not per row: the tag is one key and expiring it a
  // hundred times costs a hundred round trips to say the same thing.
  if (applied > 0) revalidateTag(CATALOGUE_TAG, 'hours')

  log.info('price_schedule.done', { due: rows.length, applied, failed })
  return NextResponse.json({ ok: true, due: rows.length, applied, failed })
}

export const GET = withRequestLog(
  '/api/cron/price-schedule',
  withJobRun('price-schedule', handleGET),
)
